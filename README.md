# makefun-btc-bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/theo1603/makefun-btc-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/theo1603/makefun-btc-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A twin-return breakout bot that trades cbBTC/USDC on 1-minute Orca Whirlpool bars: it buys the whole account when both the 60-minute and the 120-minute returns clear +0.1%, then holds behind a 2% hard stop and a 2% trailing stop, waiting 60 bars after an exit before it may re-enter. Long only, one position, at most one order per reply, fully deterministic — every decision is a pure function of the bars seen so far. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC.

On the published dev window it makes about +$31 net PnL on 1 trade with ~2% maximum drawdown (local grade).

## Run it

```sh
node main.ts
```

`main.ts` speaks agent-fun/bars-replay/v1 on stdin/stdout: it reads the hello, then one batch per minute, and answers each batch with exactly one reply carrying its orders.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
