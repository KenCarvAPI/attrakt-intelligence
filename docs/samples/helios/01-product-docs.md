# Helios — Product Documentation

## What Helios is
Helios is a stablecoin payments network. It gives developers a single API to
accept, send, and settle stablecoin payments (USDC, EURe) across multiple chains
without running their own infrastructure. Think "Stripe for stablecoins."

## Core products
- **Payments API** — accept stablecoin payments with one integration; automatic
  chain selection and gas abstraction so end users never touch a gas token.
- **Payouts** — programmatic mass payouts to wallets, with batching and retries.
- **Settlement** — instant off-ramp to bank accounts in the EU and US via
  partner rails.

## Who it serves
- Web3-native startups that need to move money but don't want to build payments.
- Fintechs experimenting with stablecoin rails.
- Marketplaces and creator platforms paying out globally.

## Key differentiators
- Multi-chain by default; the developer picks a currency, not a chain.
- Gas abstraction — no native token management for end users.
- Compliance built in: KYC/KYB and travel-rule tooling at the API layer.
- 99.99% settlement SLA with transparent on-chain proofs.
