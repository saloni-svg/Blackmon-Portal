-- Blackmon Tutoring runs one camp, Little Elm: staff and location announcements that said Plano move
-- to Little Elm. (The staff CHECK still allows 'Plano' for history; the forms only offer Little Elm.)
UPDATE staff SET location = 'Little Elm' WHERE location = 'Plano';
UPDATE announcements SET audience = '{"type":"location","location":"Little Elm"}'
  WHERE json_extract(audience, '$.type') = 'location' AND json_extract(audience, '$.location') = 'Plano';
