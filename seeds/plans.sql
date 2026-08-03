-- Seed data for subscription plans, durations, features, and plan mappings

INSERT INTO plans (name, description) VALUES
  ('Silver', 'Entry-level plan with essential features for new users.'),
  ('Gold', 'Most popular plan with premium features and extra access.'),
  ('Platinum Plus', 'Top-tier plan with all premium features active.');

INSERT INTO plan_durations (plan_id, type, price) VALUES
  (1, '1_week', 99),
  (1, '1_month', 299),
  (1, '6_months', 1499),
  (2, '1_week', 149),
  (2, '1_month', 499),
  (2, '6_months', 2299),
  (3, '1_week', 199),
  (3, '1_month', 599),
  (3, '6_months', 2499);

INSERT INTO features (name) VALUES
  ('Unlimited Likes'),
  ('See Who Liked You'),
  ('Boosts'),
  ('Rewind Swipe'),
  ('Passport'),
  ('Ad-Free Experience');

INSERT INTO plan_features (plan_id, feature_id, is_active) VALUES
  (1, 1, 1),
  (1, 2, 0),
  (1, 3, 0),
  (1, 4, 0),
  (1, 5, 0),
  (1, 6, 0),
  (2, 1, 1),
  (2, 2, 1),
  (2, 3, 1),
  (2, 4, 1),
  (2, 5, 0),
  (2, 6, 1),
  (3, 1, 1),
  (3, 2, 1),
  (3, 3, 1),
  (3, 4, 1),
  (3, 5, 1),
  (3, 6, 1);
