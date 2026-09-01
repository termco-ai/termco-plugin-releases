# Session History

Main-process current-format session persistence and its renderer transport.
The provider owns atomic sequence/revision allocation, strict validation,
durability, windows, listing, subscriptions, canonical forks, lineage-aware
age-based retention, and safe removal.
It reads and writes only `userData/sessions` in the current format.
