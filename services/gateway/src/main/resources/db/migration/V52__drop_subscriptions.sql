-- The subscription is cut (docs/store/feature-review.md): it was off at
-- the owner's word and the paid server features went with decision 0041,
-- so nothing reads or writes the free month, the paid time or the
-- monthly counts V19 made. The paywall, when it comes, is built new from
-- the pricing decision, with tables of its own. paid_feature_uses went
-- already, in V46.
DROP TABLE subscriptions;
