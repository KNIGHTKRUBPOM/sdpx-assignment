/**
 * CSV Roster Import and Sanitizer (FR-CLASS-01, FR-CLASS-02, FR-CLASS-03, FR-AUTH-03, FR-SEC-04)
 */

export interface ParsedRosterRow {
  rowNumber: number;
  email: string;
  emailNormalized: string;
  groupName: string;
  studentId?: string;
  displayName?: string;
}

export interface RosterImportResult {
  success: boolean;
  rows?: ParsedRosterRow[];
  groups?: Record<string, ParsedRosterRow[]>;
  error?: {
    code: string;
    message: string;
    rowNumber?: number;
    details?: string[];
  };
}

/**
 * Normalizes email address (FR-AUTH-03)
 * Lowercase, trim, strip dots for Gmail, strip +tag
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [localPart, domain] = trimmed.split('@');
  if (!domain) return trimmed;

  let cleanedLocal = localPart;
  // Strip +tag
  const plusIndex = cleanedLocal.indexOf('+');
  if (plusIndex !== -1) {
    cleanedLocal = cleanedLocal.substring(0, plusIndex);
  }

  // If gmail.com or googlemail.com, remove dots
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    cleanedLocal = cleanedLocal.replace(/\./g, '');
  }

  return `${cleanedLocal}@${domain}`;
}

/**
 * Sanitizes string against CSV Formula Injection (FR-SEC-04)
 * Escapes cells starting with =, +, -, @
 */
export function sanitizeCsvCell(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Parses and validates CSV roster atomically (FR-CLASS-01, 02, 03)
 */
export function parseAndValidateRosterCsv(csvContent: string): RosterImportResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      success: false,
      error: {
        code: 'EMPTY_OR_NO_DATA',
        message: 'CSV file must contain a header row and at least one data row.',
      },
    };
  }

  // Parse header row (case-insensitive)
  const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const emailIdx = headerCols.indexOf('email');
  const groupIdx = headerCols.indexOf('group_name');
  const studentIdIdx = headerCols.indexOf('student_id');
  const displayNameIdx = headerCols.indexOf('display_name');

  if (emailIdx === -1 || groupIdx === -1) {
    return {
      success: false,
      error: {
        code: 'MISSING_REQUIRED_HEADERS',
        message: 'CSV header must include "email" and "group_name".',
      },
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parsedRows: ParsedRosterRow[] = [];
  const seenEmails = new Set<string>();

  // Process rows atomically
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-indexed for human readability
    const cols = lines[i].split(',').map((c) => sanitizeCsvCell(c));

    const emailRaw = cols[emailIdx]?.replace(/^'/, ''); // unquote for validation
    const groupName = cols[groupIdx]?.replace(/^'/, '');
    const studentId = studentIdIdx !== -1 ? cols[studentIdIdx]?.replace(/^'/, '') : undefined;
    const displayName = displayNameIdx !== -1 ? cols[displayNameIdx]?.replace(/^'/, '') : undefined;

    if (!emailRaw || !emailRegex.test(emailRaw)) {
      return {
        success: false,
        error: {
          code: 'INVALID_EMAIL_FORMAT',
          message: `Row ${rowNumber}: Invalid email format "${emailRaw ?? ''}".`,
          rowNumber,
        },
      };
    }

    if (!groupName || groupName.trim() === '') {
      return {
        success: false,
        error: {
          code: 'EMPTY_GROUP_NAME',
          message: `Row ${rowNumber}: group_name cannot be empty.`,
          rowNumber,
        },
      };
    }

    const emailNorm = normalizeEmail(emailRaw);
    if (seenEmails.has(emailNorm)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_EMAIL',
          message: `Row ${rowNumber}: Duplicate email address "${emailRaw}" found.`,
          rowNumber,
        },
      };
    }
    seenEmails.add(emailNorm);

    parsedRows.push({
      rowNumber,
      email: emailRaw,
      emailNormalized: emailNorm,
      groupName: groupName.trim(),
      studentId: studentId ? studentId.trim() : undefined,
      displayName: displayName ? displayName.trim() : undefined,
    });
  }

  // Validate group sizes (FR-CLASS-03: Groups must have at least 2 members)
  const groupMap: Record<string, ParsedRosterRow[]> = {};
  for (const row of parsedRows) {
    groupMap[row.groupName] = groupMap[row.groupName] ?? [];
    groupMap[row.groupName].push(row);
  }

  const smallGroups = Object.entries(groupMap).filter(([_, members]) => members.length < 2);
  if (smallGroups.length > 0) {
    const names = smallGroups.map(([name, m]) => `"${name}" (${m.length} members)`).join(', ');
    return {
      success: false,
      error: {
        code: 'GROUP_TOO_SMALL',
        message: `Groups must have at least 2 members. Found small group(s): ${names}.`,
        details: smallGroups.map(([name]) => name),
      },
    };
  }

  return {
    success: true,
    rows: parsedRows,
    groups: groupMap,
  };
}
