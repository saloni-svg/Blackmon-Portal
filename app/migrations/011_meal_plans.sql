-- Meal plans parents save on the portal's Meal plan page. Kept in the portal only (nothing is sent to
-- GHL); admins see them on each parent's page and can export them. One per parent.
CREATE TABLE meal_plans (
  contact_id  TEXT PRIMARY KEY,                -- their GHL contact
  email       TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  choices     TEXT NOT NULL,                   -- JSON: { meal field key: choice, special request key: text }
  updated_at  TEXT NOT NULL
);
