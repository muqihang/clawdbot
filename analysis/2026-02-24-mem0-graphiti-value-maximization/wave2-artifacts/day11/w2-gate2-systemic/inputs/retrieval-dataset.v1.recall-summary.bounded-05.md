# Recall summary (bounded-05) — dataset v1

- dataset: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/inputs/retrieval-dataset.v1.json`
- run_dir: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day11/w2-gate2-systemic/retrieval/bounded-05/graphiti`
- sample_size: `34`

| metric                             |       value |
| ---------------------------------- | ----------: |
| expected_id present in raw payload | 24 (0.7059) |
| expected_id in top3                |  1 (0.0294) |
| expected_id in top1                |  0 (0.0000) |

## First misses (expected_id not present in payload)

- `g2v1-addresses-27ed29a1` expected_id=`27ed29a1-6196-4452-a9a8-9792d2844f4f` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '04c9fa6c-0c42-4bf0-858c-22e2e027f76b', '10429b6b-76ec-4d6b-a5a2-1e4b9e94d26f']
- `g2v1-combines-16268e81` expected_id=`16268e81-6341-4fcc-9b17-c112f20677d5` top3=[]
- `g2v1-has-mission-312073bf` expected_id=`312073bf-e0c8-40f8-8d49-c67527691d49` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '049fce75-ac8c-4014-81c8-0a61bcdd01a7', '179f4bb4-c769-47e2-b76d-f24acd24952c']
- `g2v1-has-primary-business-242955ff` expected_id=`242955ff-7ba4-44ff-ba89-292986df4520` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '049fce75-ac8c-4014-81c8-0a61bcdd01a7', '0cd18f6d-a677-414b-a534-621a18cb73ac']
- `g2v1-implements-e807ecd8` expected_id=`e807ecd8-d193-4ab8-93b9-c6104bc78678` top3=['04c9fa6c-0c42-4bf0-858c-22e2e027f76b', '2037385d-b37b-467b-b529-d646ed818785', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6']
- `g2v1-is-iterating-memory-mechanism-with-de2618ee` expected_id=`de2618ee-90cd-4bde-9b57-ed6e34b26bb4` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '16268e81-6341-4fcc-9b17-c112f20677d5', '2037385d-b37b-467b-b529-d646ed818785']
- `g2v1-is-planning-upgrade-with-73f72be0` expected_id=`73f72be0-4ba3-4c62-acda-b28d1375d940` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '2037385d-b37b-467b-b529-d646ed818785', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6']
- `g2v1-must-be-processed-by-a2a3e1ad` expected_id=`a2a3e1ad-ff40-4cff-b5d3-b855230b85c9` top3=[]
- `g2v1-observes-02997c4b` expected_id=`02997c4b-be77-472f-b0fa-97b944cc400c` top3=[]
- `g2v1-operates-in-scope-d2f79d6d` expected_id=`d2f79d6d-6fe7-4567-abbe-4722c22dc38a` top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '049fce75-ac8c-4014-81c8-0a61bcdd01a7', '16268e81-6341-4fcc-9b17-c112f20677d5']

## First cases (present in payload but not in top3)

- `g2v1-approves-action-b8cad503` matches=[('facts', 0)] top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6', '24796f10-db8d-4219-8fac-1f2b3803f547']
- `g2v1-asks-about-a4e7e953` matches=[('facts', 1)] top3=['025b8255-e2f3-47d8-b56f-1c9019a2c1fe', '02997c4b-be77-472f-b0fa-97b944cc400c', '0454c8d0-23ee-4235-bb4d-25b2234ab43f']
- `g2v1-assessed-4bdb77fb` matches=[('facts', 0)] top3=['04c9fa6c-0c42-4bf0-858c-22e2e027f76b', '179f4bb4-c769-47e2-b76d-f24acd24952c', '20c1e33a-5fbf-4628-adee-4ae44b1af08c']
- `g2v1-evaluated-60931d99` matches=[('facts', 0)] top3=['025b8255-e2f3-47d8-b56f-1c9019a2c1fe', '04c9fa6c-0c42-4bf0-858c-22e2e027f76b', '2037385d-b37b-467b-b529-d646ed818785']
- `g2v1-has-founder-priority-f33f6ad0` matches=[('facts', 0)] top3=['049fce75-ac8c-4014-81c8-0a61bcdd01a7', '05205ba3-aa5f-481b-8bf7-b189e05f92b9', '2037385d-b37b-467b-b529-d646ed818785']
- `g2v1-has-mission-707b1035` matches=[('facts', 0)] top3=['049fce75-ac8c-4014-81c8-0a61bcdd01a7', '05205ba3-aa5f-481b-8bf7-b189e05f92b9', '1b74a89a-162d-4bde-95bd-0c2ece3ebde0']
- `g2v1-involves-c43f91c1` matches=[('facts', 0)] top3=['02997c4b-be77-472f-b0fa-97b944cc400c', '0454c8d0-23ee-4235-bb4d-25b2234ab43f', '04c9fa6c-0c42-4bf0-858c-22e2e027f76b']
- `g2v1-is-acknowledged-for-82b07beb` matches=[('facts', 0)] top3=['05205ba3-aa5f-481b-8bf7-b189e05f92b9', '16268e81-6341-4fcc-9b17-c112f20677d5', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6']
- `g2v1-is-current-operational-mode-for-274619b0` matches=[('facts', 0)] top3=['025b8255-e2f3-47d8-b56f-1c9019a2c1fe', '04c9fa6c-0c42-4bf0-858c-22e2e027f76b', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6']
- `g2v1-is-evaluating-enablement-of-727a7391` matches=[('facts', 0)] top3=['0454c8d0-23ee-4235-bb4d-25b2234ab43f', '2037385d-b37b-467b-b529-d646ed818785', '23982bd8-eeb6-4b5b-afe7-0c13a426cae6']
