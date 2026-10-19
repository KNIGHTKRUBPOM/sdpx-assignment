import { app } from './app.js';

if (process.env.NODE_ENV !== 'test') throw new Error('Legacy mock server is test-only. Start the application with npm run dev or npm start.');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PairEval Server listening on port ${PORT}`);
  console.log(`UI: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
