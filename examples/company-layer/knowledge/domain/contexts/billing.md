# Bounded context: billing

Owns invoices, payment attempts, and settlement. **Does not own** pricing (that is `orders`) or
tax rates (an external service).

Invariants:
- An invoice is never mutated after `status: settled` — corrections are new credit notes.
- Money is integer paise. A float in a money field is a bug, not a rounding choice.
