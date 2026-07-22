-- SANTADDEO Data Transfer Script: PROD to DEV
-- This script transfers all critical data from production to development database
-- Run this against the DEV database (dshdmkmhhbjractpvojp)

-- ============================================
-- ROOM TYPES (33 records)
-- ============================================
INSERT INTO room_types (id, hotel_id, name, code, total_rooms, created_at, scidoo_room_type_id, capacity, size_sqm, additional_beds, is_active, updated_at, display_order, last_update, pms_room_type_id, capacity_default)
VALUES 
-- Tenuta Massabò (4 room types)
('52deba20-ad74-47f2-b4e7-0dfb31f5e46b', '7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9', 'CAMERA MASTER DELUXE (EBY)', 'CAMERA_MASTER_DELUXE_EBY', 1, '2026-02-11 13:52:37.266007+00', '11546', 6, '0', 0, false, '2026-03-08 15:57:45.978091+00', 3, '2026-02-11 13:52:37.266007+00', '11546', 2),
('5d37787d-843d-498b-ac11-5f88e3518907', '7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9', 'DELUXE', 'DELUXE', 4, '2026-02-11 13:52:37.266007+00', '11545', 2, '20', 0, true, '2026-03-08 15:57:45.983208+00', 2, '2026-02-11 13:52:37.266007+00', '11545', 2),
('8bb9bd5e-a5c3-43a7-9cae-1056878b4cf1', '7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9', 'STANDARD', 'STANDARD', 3, '2026-02-11 13:52:37.266007+00', '11548', 2, '20', 0, true, '2026-03-08 15:57:45.999547+00', 1, '2026-02-11 13:52:37.266007+00', '11548', 2),
('2dab1779-dbbd-424b-b744-2def0dbc3ce7', '7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9', 'SUITE', 'SUITE', 2, '2026-03-04 21:57:11.216537+00', '11547', 2, NULL, 0, true, '2026-03-08 15:57:45.995252+00', 4, '2026-03-04 21:57:11.216537+00', '11547', 2),

-- Villa I Barronci (14 room types)
('fd4a4623-dd95-492e-b488-b7ace71968a0', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Appartamento Chianti Bilocale', 'APPARTAMENTO_CHIANTI_BILOCALE', 1, '2025-11-03 00:34:05.98074+00', '7589', 4, '75.00', 1, false, '2026-02-16 15:23:44.557388+00', 14, '2025-12-30 10:30:01.335965+00', '7589', 2),
('d4ebaaad-afdf-4c8b-84a5-bf3d21b249ac', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Appartamento Toscana Trilocale', 'APPARTAMENTO_TOSCANA_TRILOCALE_', 1, '2025-11-03 00:34:05.98074+00', '7626', 6, '80.00', 0, false, '2026-02-16 15:23:44.571788+00', 1, '2025-12-30 10:30:01.335965+00', '7626', 2),
('2985a211-4ff0-44c9-bee2-91b13cbff81e', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Camera sull''albero', 'CAMERA_SULL039ALBERO', 1, '2025-11-03 00:34:05.98074+00', '7588', 2, '18.00', 0, true, '2026-02-16 15:23:44.581957+00', 11, '2025-12-30 10:30:01.335965+00', '7588', 2),
('c97a2431-3751-4644-bcd4-c65ab88ae048', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Dependance', 'DEPENDANCE', 2, '2025-11-03 00:34:05.98074+00', '7584', 2, '18.00', 1, true, '2026-02-16 15:23:44.603678+00', 9, '2025-12-30 10:30:01.335965+00', '7584', 2),
('fe8dd7b5-979c-46fd-853d-cbd3ce2c782d', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Dependance Deluxe', 'DEPENDANCE_DELUXE', 4, '2025-11-03 00:34:05.98074+00', '7585', 4, '30.00', 1, true, '2026-02-16 15:23:44.569141+00', 10, '2025-12-30 10:30:01.335965+00', '7585', 2),
('dc4a533e-4c17-4852-b253-ccc63900f2fd', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Economy', 'ECONOMY', 2, '2025-11-03 00:34:05.98074+00', '7550', 2, '15.00', 0, true, '2026-02-16 15:23:44.551206+00', 5, '2025-12-30 10:30:01.335965+00', '7550', 2),
('ed673a8a-a3ed-40d0-9eb7-8a404e304bd7', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Economy Accesso privato', 'ECONOMY_ACCESSO_PRIVATO', 1, '2025-11-03 00:34:05.98074+00', '7551', 2, '17.00', 1, true, '2026-02-16 15:23:44.595428+00', 6, '2025-12-30 10:30:01.335965+00', '7551', 2),
('4a7fec40-6b1d-4d5f-af8d-3ca4da0f9a89', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'OVER', 'OVER', 0, '2025-11-03 00:34:05.98074+00', '7590', 19, '0.00', 20, false, '2026-02-16 15:23:44.50011+00', 2, '2025-12-30 10:30:01.335965+00', '7590', 2),
('ecfc08ab-fa2e-499d-9e93-4e5b001668b2', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Over Barronci', 'OVER_BARRONCI', 0, '2025-11-03 00:34:05.98074+00', '18243', 19, '0.00', 0, false, '2026-02-16 15:23:44.541943+00', 3, '2025-12-30 10:30:01.335965+00', '18243', 2),
('466ab05e-2b3e-4d52-8561-b5c5cf09f628', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Suite', 'SUITE', 3, '2025-11-03 00:34:05.98074+00', '7586', 4, '28.00', 1, true, '2026-02-16 15:23:44.55728+00', 12, '2025-12-30 10:30:01.335965+00', '7586', 2),
('6cdb5de0-4415-41af-9a42-177242e1b521', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Suite Accesso Privato', 'SUITE_ACCESSO_PRIVATO', 1, '2025-11-03 00:34:05.98074+00', '7587', 6, '60.00', 1, true, '2026-02-16 15:23:44.598928+00', 13, '2025-12-30 10:30:01.335965+00', '7587', 2),
('d66e1d2a-3558-4449-87d4-f1adfc1eb634', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Tuscan Style', 'TUSCAN_STYLE', 7, '2025-11-03 00:34:05.98074+00', '7552', 2, '17.00', 1, true, '2026-02-16 15:23:44.537939+00', 7, '2025-12-30 10:30:01.335965+00', '7552', 2),
('cdbe5dc1-ba35-4e76-9f3d-7a140da0694a', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'Tuscan Superior', 'TUSCAN_SUPERIOR', 3, '2025-11-03 00:34:05.98074+00', '7583', 4, '20.00', 0, true, '2026-02-16 15:23:44.55728+00', 8, '2025-12-30 10:30:01.335965+00', '7583', 2),
('b8214a75-f4ff-448b-aff6-62017ab70238', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca', 'VILLA IN ESCLUSIVA', 'VILLA_IN_ESCLUSIVA', 1, '2025-11-03 00:34:05.98074+00', '17920', 19, '1200.00', 20, false, '2026-02-16 15:23:44.649669+00', 4, '2025-12-30 10:30:01.335965+00', '17920', 2),

-- Casa Vacanze Rondini Blu (5 room types)
('6253b62e-c9ca-4cc2-8697-21e4fa7f4015', '96315c81-9bed-4c2f-b981-da899c0bd04b', 'Appartamento "Family" con 2 Camere da Letto', 'APPARTAMENTO_QUOTFAMILYQUOT_CON_2_CAMERE_DA_LETTO', 1, '2026-02-08 11:16:52.619825+00', '15487', 4, '80', 1, true, '2026-02-16 15:04:01.823987+00', NULL, '2026-02-08 11:16:52.619825+00', '15487', 2),
('e7ceed6d-7107-4d76-8be0-be1af60a1cbf', '96315c81-9bed-4c2f-b981-da899c0bd04b', 'Appartamento "Focolare" con 1 camera da letto', 'APPARTAMENTO_QUOTFOCOLAREQUOT_CON_1_CAMERA_DA_LETTO', 1, '2026-02-08 11:16:52.619825+00', '12923', 4, '56', 1, true, '2026-02-16 15:04:01.823987+00', NULL, '2026-02-08 11:16:52.619825+00', '12923', 2),
('424d542a-35c2-480e-85ad-7c18e11512f0', '96315c81-9bed-4c2f-b981-da899c0bd04b', 'Appartamento "Margherite" con 2 Camere da Letto', 'APPARTAMENTO_QUOTMARGHERITEQUOT_CON_2_CAMERE_DA_LETTO', 1, '2026-02-08 11:16:52.619825+00', '12925', 6, '100', 1, true, '2026-02-16 15:04:01.823987+00', NULL, '2026-02-08 11:16:52.619825+00', '12925', 2),
('353ebf4b-7dcc-4bae-b5d2-0fb6bd866fd8', '96315c81-9bed-4c2f-b981-da899c0bd04b', 'Appartamento "Torretta" su 2 Livelli con Suite', 'APPARTAMENTO_QUOTTORRETTAQUOT_SU_2_LIVELLI_CON_SUITE', 1, '2026-02-08 11:16:52.619825+00', '15387', 6, '100', 1, true, '2026-02-16 15:04:01.823987+00', NULL, '2026-02-08 11:16:52.619825+00', '15387', 2),
('5fb2cd83-7888-4fa8-a4ce-408740ba026a', '96315c81-9bed-4c2f-b981-da899c0bd04b', 'Appartamento "Uva" con 1 Camera da Letto', 'APPARTAMENTO_QUOTUVAQUOT_CON_1_CAMERA_DA_LETTO', 1, '2026-02-08 11:16:52.619825+00', '15486', 4, '46', 1, true, '2026-02-16 15:04:01.823987+00', NULL, '2026-02-08 11:16:52.619825+00', '15486', 2),

-- Podere Casanova (6 room types)
('e2f3b5ea-b221-47de-862d-ddc709431b9b', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Appartamento Ciliegio', 'appartamento-ciliegio', 1, '2026-02-19 20:37:21.113518+00', NULL, 2, NULL, 0, true, '2026-02-24 03:09:34.350669+00', 1, '2026-02-19 20:37:21.113518+00', '6166', 2),
('e25d8a22-91dc-4516-8502-65dbbbb79222', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Appartamento Gelsomino', 'appartamento-gelsomino', 1, '2026-02-19 20:37:21.282225+00', NULL, 2, NULL, 0, true, '2026-02-24 03:09:34.294066+00', 2, '2026-02-19 20:37:21.282225+00', '6234', 2),
('3f687fbc-dd15-4b11-b12d-45b52b20da1a', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Appartamento Ginestra', 'appartamento-ginestra', 1, '2026-02-19 20:37:21.218166+00', NULL, 2, NULL, 0, true, '2026-02-24 03:09:34.310561+00', 4, '2026-02-19 20:37:21.218166+00', '6169', 2),
('997f1f60-b20b-44e3-bd7a-65d2fec980c9', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Appartamento Melograno', 'appartamento-melograno', 1, '2026-02-19 20:37:21.378263+00', NULL, 2, NULL, 0, true, '2026-02-24 03:09:34.322141+00', 3, '2026-02-19 20:37:21.378263+00', '6168', 2),
('6296c457-0786-4fb0-9203-5df17bcad020', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Appartmento Cipresso', 'appartmento-cipresso', 1, '2026-02-19 20:37:21.457272+00', NULL, 2, NULL, 0, true, '2026-02-24 03:09:34.348789+00', 5, '2026-02-19 20:37:21.457272+00', '6170', 2),
('140462c7-e9cc-4cd8-b730-f458d53ac6a2', 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6', 'Tutte le camere (aggregato)', 'ALL', 5, '2026-02-18 23:06:47.308798+00', NULL, 2, NULL, 0, false, '2026-02-24 03:09:34.322278+00', 6, '2026-02-18 23:06:47.308798+00', 'ALL', 2),

-- Tenuta Moriano (4 room types)
('1212ac01-83bb-4162-bf6f-339a04b711bd', 'b9f9f2f4-04f1-4592-afa5-eddf445603bd', 'Bilocale Standard', 'BILOCALE_STANDARD', 2, '2026-02-10 17:37:30.749249+00', '7637', 2, '40', 2, true, '2026-02-16 16:26:12.972413+00', 1, '2026-02-10 17:37:30.749249+00', '7637', 2),
('004e7c0d-69fc-4e6c-a99e-be7446de2854', 'b9f9f2f4-04f1-4592-afa5-eddf445603bd', 'Trilocale Luxury', 'TRILOCALE_LUXURY', 2, '2026-02-10 17:37:30.749249+00', '7640', 4, '52', 2, true, '2026-02-16 16:26:12.953733+00', 4, '2026-02-10 17:37:30.749249+00', '7640', 2),
('090ecc4e-d699-4e96-b0e6-27270d2b241c', 'b9f9f2f4-04f1-4592-afa5-eddf445603bd', 'Trilocale Standard', 'TRILOCALE_STANDARD', 4, '2026-02-10 17:37:30.749249+00', '7638', 4, '52', 2, true, '2026-02-16 16:26:12.933833+00', 2, '2026-02-10 17:37:30.749249+00', '7638', 2),
('6d3d8286-7439-40e0-869c-c7845d56f10d', 'b9f9f2f4-04f1-4592-afa5-eddf445603bd', 'Trilocale Superior', 'TRILOCALE_SUPERIOR', 2, '2026-02-10 17:37:30.749249+00', '7639', 4, '52', 2, true, '2026-02-16 16:26:12.940099+00', 3, '2026-02-10 17:37:30.749249+00', '7639', 2)
ON CONFLICT (id) DO NOTHING;
