import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  parseAndValidateRosterCsv,
  sanitizeCsvCell,
} from '../src/core/roster/csv-roster.js';

describe('Roster CSV Import & Sanitizer (PRD §7.2, §14.3)', () => {
  it('FR-AUTH-03: normalizes emails by lowercasing, stripping +tags, and removing dots for gmail', () => {
    expect(normalizeEmail('Somchai.A+test@gmail.com')).toBe('somchaia@gmail.com');
    expect(normalizeEmail('Student.B@uni.ac.th')).toBe('student.b@uni.ac.th');
    expect(normalizeEmail('Nok+sdpx@chula.ac.th')).toBe('nok@chula.ac.th');
  });

  it('FR-SEC-04: escapes CSV cells starting with formula triggers (=, +, -, @)', () => {
    expect(sanitizeCsvCell('=SUM(A1:B1)')).toBe("'=SUM(A1:B1)");
    expect(sanitizeCsvCell('+cmd|')).toBe("'+cmd|");
    expect(sanitizeCsvCell('-123')).toBe("'-123");
    expect(sanitizeCsvCell('@admin')).toBe("'@admin");
    expect(sanitizeCsvCell('Normal Text')).toBe('Normal Text');
  });

  it('FR-CLASS-01: parses valid CSV with case-insensitive headers', () => {
    const csv = `EMAIL,Group_Name,Student_ID,Display_Name
nok@uni.ac.th,Group Alpha,65010001,Nok
ton@uni.ac.th,Group Alpha,65010002,Ton
somchai@uni.ac.th,Group Beta,65010003,Somchai
suda@uni.ac.th,Group Beta,65010004,Suda`;

    const res = parseAndValidateRosterCsv(csv);
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(4);
    expect(Object.keys(res.groups!)).toHaveLength(2);
  });

  it('FR-CLASS-02: atomic rejection on row error (reports specific row number)', () => {
    // Row 3 has invalid email
    const csv = `email,group_name
alice@uni.ac.th,Group 1
not-an-email,Group 1
bob@uni.ac.th,Group 2
charlie@uni.ac.th,Group 2`;

    const res = parseAndValidateRosterCsv(csv);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_EMAIL_FORMAT');
    expect(res.error?.rowNumber).toBe(3);
    expect(res.error?.message).toContain('Row 3');
  });

  it('FR-CLASS-03: rejects duplicate emails and groups with < 2 members', () => {
    // Duplicate email
    const dupCsv = `email,group_name
alice@uni.ac.th,Group 1
alice@uni.ac.th,Group 1`;
    const resDup = parseAndValidateRosterCsv(dupCsv);
    expect(resDup.success).toBe(false);
    expect(resDup.error?.code).toBe('DUPLICATE_EMAIL');

    // Group with only 1 member
    const soloCsv = `email,group_name
alice@uni.ac.th,Group 1
bob@uni.ac.th,Group 1
solo@uni.ac.th,Solo Group`;
    const resSolo = parseAndValidateRosterCsv(soloCsv);
    expect(resSolo.success).toBe(false);
    expect(resSolo.error?.code).toBe('GROUP_TOO_SMALL');
    expect(resSolo.error?.message).toContain('Solo Group');
  });
});
