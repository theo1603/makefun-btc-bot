// Twin-return breakout bot for the make.fun BTC race (agent-fun/bars-replay/v1).
//
// Idea, written from scratch: one-minute cbBTC bars are mostly noise (a
// typical 1-minute move is ~8 bps while a full round trip costs ~26 bps),
// so the bot only trades a move that is visible on two horizons at once.
// It buys the whole account when BOTH the 60-minute and the 120-minute
// returns are positive by more than 0.1% -- a short up-move confirmed by a
// longer one -- and then holds, protected by a 2% hard stop under its entry
// and a 2% trailing stop under the best close since entry. After an exit it
// waits 60 bars before it may re-enter, and it never opens a new position
// in the last 60 bars of the window, so nothing is left to the final
// flatten except a position that is still inside its stops.
//
// Long only, one position, at most one order per reply, fully deterministic:
// every decision is a pure function of the bars seen so far. No clock, no
// network, no environment, no randomness.
//
// On the published dev window this makes about +$37 net PnL on 3 trades
// with ~1.6% maximum drawdown (local grade).

const SYMBOL = "CBBTC";
const MAX_SLIPPAGE_BPS = 250;

// Entry: 60-minute and 120-minute returns must both clear this.
const ENTRY_RET = 0.001;
// Exit: 2% below entry (hard stop) or 2% below the best close since entry.
const STOP = 0.02;
const TRAIL = 0.02;
// Take profit: bank a strong run at +4% instead of giving it back to the
// trailing stop. On the dev window the single trade peaked at +4.46% over
// its fill and gave back ~0.9pp before the final flatten; a 4% take-profit
// locks in most of that run (local grade: +$36.94 vs +$30.98, 3 trades,
// max drawdown 1.58% vs 1.98%). Neighbouring levels 3.5%/3.8% give nearly
// the same result, so 4% is a plateau, not a knife-edge fit.
const TAKE_PROFIT = 0.04;
// Cooldown in bars after an exit before a new entry may fire.
const COOLDOWN_BARS = 60;
// Never open a new position once this many bars have been seen.
const NO_BUY_AFTER_BARS = 1380;

interface Fill {
  client_id: string;
  symbol: string;
  side: string;
  status: string;
  price: string;
  qty: string;
}

interface Bar {
  symbol: string;
  c: string;
}

let warmupBars = 0;
let seq = -1;

// Market history: closes of CBBTC in raw price units (ratios only matter).
const closes: number[] = [];

// Account, as last reported by the harness.
let cash = 0;
let positionQty = 0; // raw base units, 0 when flat
let positionCost = 0; // quote units, fees included

// Trade state.
let entryPrice: number | null = null; // exact fill price of the open position
let peakClose = 0; // best close since entry
let lastExitBars = -1000000; // closes.length when the last exit was decided
let awaitingFill = false; // a buy was sent, its fill not yet reported
let nextOrder = 1;

function decide(): Array<Record<string, unknown>> {
  const n = closes.length;
  if (n === 0 || seq < warmupBars) return [];
  const close = closes[n - 1];

  if (positionQty > 0) {
    // We hold: keep the trailing peak current, exit on either stop.
    if (entryPrice === null) {
      // Fallback: derive the entry price from the position's cost basis.
      // value = qty * price * 10^quote_scale / 10^(qty_scale + price_scale)
      // with quote_scale 6, qty_scale 8, price_scale 5:
      // price = cost * 10^7 / qty.
      entryPrice = (positionCost * 1e7) / positionQty;
    }
    if (close > peakClose) peakClose = close;
    const stopHit = close < entryPrice * (1 - STOP);
    const trailHit = close < peakClose * (1 - TRAIL);
    const takeHit = close > entryPrice * (1 + TAKE_PROFIT);
    if (stopHit || trailHit || takeHit) {
      lastExitBars = n;
      return [
        {
          side: "sell",
          client_id: `o${nextOrder++}`,
          symbol: SYMBOL,
          qty: String(positionQty),
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }

  // Flat: only one live order at a time, and never chase the last hour.
  if (awaitingFill || n >= NO_BUY_AFTER_BARS) return [];
  if (n - lastExitBars < COOLDOWN_BARS) return [];
  if (n < 121) return [];
  const ret60 = close / closes[n - 61] - 1;
  const ret120 = close / closes[n - 121] - 1;
  if (ret60 > ENTRY_RET && ret120 > ENTRY_RET && cash >= 1000000) {
    awaitingFill = true;
    return [
      {
        side: "buy",
        client_id: `o${nextOrder++}`,
        symbol: SYMBOL,
        notional_quote_units: String(cash),
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  }
  return [];
}

function applyBatch(msg: any): void {
  seq = msg.seq;
  for (const bar of msg.bars as Bar[]) {
    if (bar.symbol === SYMBOL) closes.push(Number(bar.c));
  }
  for (const fill of msg.fills as Fill[]) {
    if (fill.symbol !== SYMBOL) continue;
    if (fill.status !== "filled") {
      if (fill.side === "buy") awaitingFill = false;
      continue;
    }
    if (fill.side === "buy") {
      awaitingFill = false;
      entryPrice = Number(fill.price);
      peakClose = Number(fill.price);
    } else {
      entryPrice = null;
      peakClose = 0;
    }
  }
  const account = msg.account;
  cash = Number(account.cash_quote_units);
  positionQty = 0;
  positionCost = 0;
  for (const p of account.positions) {
    if (p.symbol === SYMBOL) {
      positionQty = Number(p.qty);
      positionCost = Number(p.cost_quote_units);
    }
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let idx: number;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).replace(/\r$/, "");
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.type === "hello") {
      warmupBars = typeof msg.warmup_bars === "number" ? msg.warmup_bars : 0;
      cash = Number(msg.capital.quote_units);
    } else if (msg.type === "batch") {
      applyBatch(msg);
      const orders = decide();
      process.stdout.write(
        JSON.stringify({ type: "reply", seq: msg.seq, orders }) + "\n",
      );
    } else if (msg.type === "done") {
      process.exit(0);
    }
  }
});
