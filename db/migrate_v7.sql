-- Migration v7: Add "ready" status support
-- The status column is VARCHAR(30), so no schema change needed.
-- This migration just documents the new status value.

-- New order status flow:
-- new -> processing -> collecting -> ready -> done
--                                         -> cancelled (from any stage)

-- "ready" = Готов к выдаче (Ready for pickup)
-- Payment requisites are now sent at "ready" stage instead of "done"
-- Subscriptions are still activated at "done" stage

-- No ALTER needed - status is VARCHAR(30) and accepts any string value.
-- This file serves as documentation of the change.
