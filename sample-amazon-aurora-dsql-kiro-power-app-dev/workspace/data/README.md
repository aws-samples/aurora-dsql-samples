# Source extracts

Synthetic extracts from a manufacturer's operational systems. All records are
fictional.

- ERP: work orders
- WMS: inventory lots
- QMS: quality holds
- MES: material issues, work-order outputs, and lot genealogy

Every file is UTF-8, comma-separated, with a header row. Primary keys are UUIDs.
`source_system` plus `source_record_id` identify a record in the system it came
from. Timestamps are ISO 8601 in UTC; dates are ISO 8601. Quantities are whole
numbers in the part's unit of measure. An empty value means "not set".

`dataset-manifest.json` lists the files, their row counts, and a load order that
respects references between files. `SHA256SUMS` holds checksums of those files.

## Files

| File | One row per | Notes |
| --- | --- | --- |
| `plants.csv` | Plant | `plant_code`, `country_code`, `timezone_name` |
| `suppliers.csv` | Supplier | `status` is `ACTIVE` |
| `parts.csv` | Part | `part_type` is `FINISHED_GOOD` or `COMPONENT`; `base_uom` is `EA` |
| `part_revisions.csv` | Revision of a part | `status` is `ACTIVE`; empty `effective_to` means open-ended |
| `bom_components.csv` | Component line in a finished-good revision's bill of material | `quantity_per` component units per finished unit |
| `work_orders.csv` | Production order | `status` is `READY` or `COMPLETE`; `planned_quantity`, `due_date` |
| `inventory_lots.csv` | Stock lot at a plant | `quantity_on_hand`, `quantity_reserved`, `inspection_disposition` (`RELEASED` or `HOLD`), `expiration_date` (empty if the lot does not expire); `supplier_id` is empty for lots produced in-house |
| `quality_holds.csv` | Quality hold on a lot | `hold_type`, `reason_code`, `severity`, `status` (`OPEN` in this extract); `released_at` is empty while open |
| `material_issues.csv` | Quantity of a lot issued to a work order | |
| `work_order_outputs.csv` | Finished lot produced by a work order | |
| `lot_genealogy_edges.csv` | Consumed lot linked to the lot it was built into, through a work order | |

## `fixtures/`

Test files with deliberately duplicate or invalid records. They are not part of
the extract. Load them only when explicitly asked to run a negative test.
