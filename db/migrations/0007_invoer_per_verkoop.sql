-- Invoer van courtage, verdeling en kosten in het portaal (issue #7, ADR-007).
-- Wie het laatst iets invulde; alleen een id, geen naam (geen persoonsgegevens in logs of afgeleide tabellen).
alter table verkoop add column gewijzigd_door uuid references gebruiker (id);
alter table kostenregel add column gewijzigd_door uuid references gebruiker (id);
alter table kostenregel add column gewijzigd_op timestamptz not null default now();
