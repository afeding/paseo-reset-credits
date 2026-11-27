Shows the rate limit resets you have banked on Codex and Claude, and lets you spend one from Paseo.

Small chips in the sidebar footer show how many resets each account has and when the next one expires. Press one to see each kind of reset with a Use button. Using a reset asks for confirmation first.

The plugin also adds a Resets card to Paseo's Usage window, listing each kind of reset, how many you have and when it expires. Paseo's Usage window cannot hold plugin buttons, so resets are used from the sidebar chips.

## Reset kinds

- Codex: full resets, which refill your Codex limits.
- Claude: 5-hour, weekly, full and Fable resets. A Fable reset refills your Fable allowance and gives back what Fable used of your weekly limit; it does not reset the whole week.

When several resets of the same kind are banked, the one that expires first is used.

## Setup

The plugin reads the logins that already exist on the daemon machine. Nothing else is needed.

- Codex: the Codex CLI must be installed and signed in. The plugin starts `codex app-server` for a few seconds to read or spend resets.
- Claude: Claude Code must be signed in with a Claude subscription. On Windows and Linux the plugin reads `~/.claude/.credentials.json`; on macOS it reads the Claude Code entry in the Keychain. `CLAUDE_CONFIG_DIR` is respected.

Requires Paseo 0.18 or later.

## Data and limits

- Login tokens stay on the daemon machine. They are sent only to `api.anthropic.com` (Claude) and, through the Codex CLI, to OpenAI.
- The plugin never refreshes a login. If the Claude token has expired, open Claude Code once to renew it.
- Codex and Claude do not document these reset endpoints. They can change without notice; the plugin follows what the official clients do.
- Each attempt uses an idempotency key, so retrying after an error never spends a second reset.
- Readings are cached for a minute (Codex) or five minutes (Claude), because Claude rate limits its usage endpoint.
