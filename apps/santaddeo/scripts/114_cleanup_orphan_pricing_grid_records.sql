-- Cleanup record orfani in pricing_grid: prezzi compilati per occupanze
-- fuori dal range [min_occupancy, max_occupancy] della camera.
--
-- Motivazione (29/04/2026): la pagina /accelerator/pricing mostrava le righe
-- occupancy basandosi sugli arrangements della tariffa, senza intersecarle
-- col range della camera. Esempio Massabo': la tariffa "STANDARD B&B" ha
-- arrangements pax 1-6, ma la camera DELUXE accetta max 2 pax. L'utente ha
-- compilato prezzi per occ 3-4 sulla DELUXE, il push li ha mandati a Scidoo
-- che li ha scartati silenziosamente. I record sono rimasti in pricing_grid
-- come "fantasmi": appaiono in app, sono persistiti, ma non finiranno mai
-- nel PMS.
--
-- Questo script li elimina. Da ora in poi:
--   - la UI clamp le occupanze al range della camera (intersezione)
--   - il push verso Scidoo skippa con warning quelle fuori range
-- Quindi questo cleanup risolve il backlog storico, le nuove scritture sono
-- bloccate alla sorgente.
--
-- IMPORTANTE: lo eseguiamo solo per Tenuta Massabo' (l'unico caso noto).
-- Se serve estenderlo ad altri hotel, va valutato caso per caso.

WITH orphans AS (
  SELECT pg.id
  FROM pricing_grid pg
  JOIN room_types rt ON rt.id = pg.room_type_id
  JOIN hotels h ON h.id = pg.hotel_id
  WHERE h.code = 'MASS'
    AND (
      pg.occupancy < COALESCE(rt.min_occupancy, 1)
      OR pg.occupancy > COALESCE(rt.max_occupancy, rt.capacity, 999)
    )
)
DELETE FROM pricing_grid
WHERE id IN (SELECT id FROM orphans)
RETURNING id, room_type_id, rate_id, date, occupancy, price;
