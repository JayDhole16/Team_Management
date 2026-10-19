// Runs docs/llm-eval-samples.md against the local Ollama model and writes a report.
// Usage: pnpm llm:eval -- --model qwen3.5:4b --runs 2 [--only B1,U2] [--out file.md] [--language hinglish]
import { main } from '../apps/server/src/llm/eval';

await main(process.argv.slice(2));
