-- Opschonen van intakedossiers (ADR-015, stap A9): de datum waarop een woning van het bord verdween. Een woning die
-- zonder verkoop verdwijnt, wordt na 30 dagen met haar intakedossier verwijderd; de sync houdt deze datum bij.
alter table woning add column niet_zichtbaar_sinds date;
