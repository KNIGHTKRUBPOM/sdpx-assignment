import { app } from './app.js';
import { seedDemoData } from './demo-data.js';

const PORT = process.env.PORT || 3000;

seedDemoData();

app.listen(PORT, () => {
  console.log(`PairEval Server listening on port ${PORT}`);
  console.log(`UI: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});

