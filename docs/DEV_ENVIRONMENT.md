# Development environment (your laptop + MacBook), then move to the client's PC

## Machines and roles
| Machine | Runs |
|---|---|
| Dev laptop (RTX 4050, 6 GB VRAM) | Claude Code, server, web app, PostgreSQL (Docker), Ollama on the GPU, and the Windows agent if the laptop runs Windows |
| Spare MacBook | Mac agent testing, browser registration tests, Phase 10 restricted-mode tests (on a separate standard user account) |
| Your phone | Owner dashboard test (responsive layout and push alerts) |
| Client's GPU PC (later) | Production. Same software, installed from the deploy/ folder produced in Phase 11 |

## Day-1 setup on the laptop
1. Install Git, Node LTS, pnpm, Docker Desktop (WSL2 on Windows), Ollama (ollama.com) and Claude Code.
2. Check the GPU works: run a model with `ollama run <model>`, then `ollama ps`. It should say 100% GPU. Close GPU-heavy apps; a browser with hardware acceleration can hold 0.5 to 1 GB of VRAM.
3. Keep one model loaded at a time (Ollama setting OLLAMA_MAX_LOADED_MODELS=1).

## Model plan for 6 GB VRAM
- 6 GB fits 3 to 4B class models comfortably. 7 to 8B models only just fit (about 5.5 GB at Q4) and run slowly.
- Start with `qwen3.5:4b` (about 3.4 GB in the Ollama library). Alternatives: `qwen3:4b`, `phi4-mini`, `llama3.2:3b`. Model names change; check ollama.com/library before pulling.
- Settings: small context (OLLAMA_NUM_CTX=4096), thinking disabled, temperature 0.2, JSON schema output.
- Expect weaker Hinglish than bigger models. Already built in to compensate: few-shot examples in the prompts, the owner reviews and edits every generated task before it is sent, clarifying questions for vague briefs.
- Phase 4: run the eval on 2 or 3 models and record the results in docs/PROGRESS.md.
- The client's PC may have a bigger GPU. Re-run the eval there and pick the best model that fits. OLLAMA_MODEL is only a setting; no code change is needed.

## Connecting the machines during development
- Same Wi-Fi: the MacBook agent uses `http://<laptop-LAN-IP>:4000`. On Windows, allow that port through the firewall for the private network only.
- Browser camera access needs HTTPS (localhost counts as secure). To test registration from the MacBook or your phone, run a free Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:4000`. It prints a temporary https address. Use it for testing only; the address changes every run.
- The agent loads its own screens from the app files, so its camera does not need the HTTPS address.
- Never test enforcement (app and website blocking) on your own account. Use a separate standard user on the MacBook (Phase 10).

## Moving to the client's PC (Phase 11 and on-site)
- You do NOT need Claude Code on their PC. Phase 11 produces a deploy/ folder (production compose file, .env.production.example, install and update scripts) and docs/DEPLOYMENT.md. Follow them on-site.
- If you ever do use Claude Code there, run `/logout` afterwards. Never leave your account or an API key on their machine.
- At the client: install Docker, Ollama and cloudflared; pull the model; run the LLM eval on their GPU; deploy; create the owner account; install the agent on each company MacBook.
- Start production with an empty database. Do not copy your test data or test faces.
- Keep your own copy of the source in your private repo and hand over what the quotation says.
