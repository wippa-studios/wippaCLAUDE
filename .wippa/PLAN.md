# Plan ledger

The orchestrator owns this file. It is the only file the orchestrator may write.
Replace the placeholders at the start of an engagement and update the ledger
whenever a work item changes state, a decision is made, or a risk opens or
closes. A new session reads this file before writing a plan of its own.

Tier: Normal — <the reason for this tier>

## Decisions

- <the tier call, any tie-break routing, an approved plan and its conditions>

## Work items

| Item | Owner | State | Acceptance criterion |
|---|---|---|---|
| <the change, in one line> | <subagent id> | planned | <the command that decides pass or fail> |

States: `planned`, `in flight`, `completed`, `blocked`.

## Open risks

- <anything unfixed, unverified or out of scope>
