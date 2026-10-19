--
-- PostgreSQL database dump
--

\restrict anBLtCIO7ZNZ8BpL1ArGHgL6LcGTywaWcJPw4PodnvkiS9z3dT3AXed2WbIuKVg

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: agents; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.agents VALUES ('agent_b3a45862-1825-469f-ac71-4f114c34432a', 'Man', 'built_in', '{"systemPrompt": "mm"}', NULL, NULL, '2026-09-30 20:31:52.691863+00', '2026-09-30 20:31:52.691863+00');
INSERT INTO public.agents VALUES ('seo-agent', 'SEO-Agent', 'remote_ag_ui', '{"endpoint": "http://127.0.0.1:4310/"}', '5c1ddfe0-8d51-4093-9509-154206b74bcb', NULL, '2026-10-04 11:30:48.440177+00', '2026-10-04 11:53:05.75+00');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.users VALUES ('k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD', 'cntconnect3@gmail.com', 'CNTConnect 3', 'https://lh3.googleusercontent.com/a/ACg8ocI8sw_lzmzwD9cFTLQgeZF9cm1xqBY_nBlFdT7geM-XDr8WUw=s96-c', true, '{}', '2026-10-01 17:17:07.167+00', '2026-10-01 17:17:12.584+00', 0, '2026-10-01 17:17:12.58482+00', '2026-10-01 17:17:07.193+00');
INSERT INTO public.users VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'dailyfunde.yt@gmail.com', 'Stefan Kunc', 'https://lh3.googleusercontent.com/a/ACg8ocJ445li4iWdIJHs40gZ_o0rskXN_C_nbmOET8mwD0_tqOf-seK8=s96-c', true, '{}', '2026-09-30 20:11:57.934+00', '2026-10-04 14:44:16.127+00', 0, '2026-09-30 20:12:50.506708+00', '2026-10-04 14:44:16.102+00');
INSERT INTO public.users VALUES ('zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', 'stefankunc994@gmail.com', 'Stefan Kunc', 'https://lh3.googleusercontent.com/a/ACg8ocKcNqYtOK7XIh1MAYjlVUbTbDkHiW8bJnKoPip1UrxQUyTMzeZm=s96-c', true, '{}', '2026-10-04 14:47:30.292+00', '2026-10-04 14:47:42.268+00', 0, '2026-10-04 14:47:42.272862+00', '2026-10-04 14:47:30.336+00');
INSERT INTO public.users VALUES ('b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L', 'dailyfunen.yt@gmail.com', 'Stefan Kunc', 'https://lh3.googleusercontent.com/a/ACg8ocJkbzYu89ejvBSeFgKV-QC9DsuPv56V6w3ysreHS4aULWzNBwk=s96-c', true, '{}', '2026-10-05 23:13:29.099+00', '2026-10-05 23:13:38.255+00', 0, '2026-10-05 23:13:38.257622+00', NULL);


--
-- Data for Name: agent_preferences; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: agent_profiles; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.agent_profiles VALUES ('agent_b3a45862-1825-469f-ac71-4f114c34432a', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'ss', 'mm', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', 'private', NULL, '2026-09-30 20:31:52.691863+00', '2026-09-30 20:31:52.691863+00', NULL, NULL);
INSERT INTO public.agent_profiles VALUES ('seo-agent', NULL, 'SEO-Analyse (lokal)', 'Prüft Websites auf SEO, komplett lokal auf diesem PC. Öffnet Links im Browser, macht Screenshots, führt ein vollständiges Audit durch (Crawl, 52 Regeln, Bewertung mit Laya) und schreibt einen Markdown-Bericht mit Maßnahmen-Tabelle. Beispiel: "Mach SEO für https://example.de".', 'seo-agent', 'public', NULL, '2026-10-04 11:30:48.440177+00', '2026-10-04 11:53:05.75+00', NULL, NULL);


--
-- Data for Name: channels; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.channels VALUES ('channel_87f7e789-0c34-4f74-aab1-5ba611ba3f02', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-04 14:48:36.981+00', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-04 14:47:45.002971+00', '2026-10-04 14:48:38.861+00', NULL, NULL, NULL);
INSERT INTO public.channels VALUES ('channel_cf2c112d-c3a6-4d07-8536-239682d03ba9', 'SEO-Agent', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-04 14:50:00.259+00', 'seo-agent', '2026-10-04 14:48:51.114772+00', '2026-10-04 14:50:02.181+00', NULL, NULL, NULL);
INSERT INTO public.channels VALUES ('channel_c388ddeb-d4bc-492b-9f62-e30e92ab136b', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-04 17:31:08.636+00', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-04 17:31:09.846959+00', '2026-10-04 17:31:11.082+00', NULL, NULL, NULL);
INSERT INTO public.channels VALUES ('channel_8e98acac-99fb-4788-aca5-ab44c15d1498', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-05 22:42:29.543+00', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-05 22:42:27.831727+00', '2026-10-05 22:42:30.536+00', NULL, NULL, NULL);
INSERT INTO public.channels VALUES ('channel_a1b78fb9-19cd-497d-8f9a-1277664da73c', 'SEO-Agent', 'Private agent channel.', '{}', '{}', NULL, NULL, NULL, NULL, NULL, '2026-10-05 23:13:49.144334+00', '2026-10-05 23:13:49.144334+00', NULL, NULL, NULL);
INSERT INTO public.channels VALUES ('channel_5ea69222-aece-4b33-8464-85fd467a2890', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-17 09:18:56.188+00', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-17 09:18:28.924905+00', '2026-10-17 09:26:51.928+00', '2026-10-17 09:26:51.928+00', NULL, NULL);
INSERT INTO public.channels VALUES ('channel_3b154602-a485-4290-a340-95f1c259e73f', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, NULL, NULL, NULL, '2026-10-17 09:18:28.643433+00', '2026-10-17 09:26:55.86+00', '2026-10-17 09:26:55.86+00', NULL, NULL);
INSERT INTO public.channels VALUES ('channel_ed211a4e-34f9-41ca-a9b0-d837d3f4195c', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, NULL, NULL, NULL, '2026-10-17 09:18:28.08319+00', '2026-10-17 09:27:08.164+00', '2026-10-17 09:27:08.164+00', NULL, NULL);
INSERT INTO public.channels VALUES ('channel_e04ec0cb-0223-4a9a-9a5c-962fb8c0ce8b', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, NULL, NULL, NULL, '2026-10-17 09:18:27.15673+00', '2026-10-17 09:27:11.513+00', '2026-10-17 09:27:11.513+00', NULL, NULL);
INSERT INTO public.channels VALUES ('channel_80d3640c-2788-4324-82f1-7e0ae85b3847', 'Man', 'Private agent channel.', '{}', '{}', NULL, NULL, 'Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).', '2026-10-04 12:12:11.491+00', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-09-30 20:32:09.898108+00', '2026-10-17 09:27:14.671+00', '2026-10-17 09:27:14.671+00', NULL, NULL);


--
-- Data for Name: channel_agents; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.channel_agents VALUES ('channel_80d3640c-2788-4324-82f1-7e0ae85b3847', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-09-30 20:32:09.898108+00');
INSERT INTO public.channel_agents VALUES ('channel_87f7e789-0c34-4f74-aab1-5ba611ba3f02', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-04 14:47:45.002971+00');
INSERT INTO public.channel_agents VALUES ('channel_cf2c112d-c3a6-4d07-8536-239682d03ba9', 'seo-agent', '2026-10-04 14:48:51.114772+00');
INSERT INTO public.channel_agents VALUES ('channel_c388ddeb-d4bc-492b-9f62-e30e92ab136b', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-04 17:31:09.846959+00');
INSERT INTO public.channel_agents VALUES ('channel_8e98acac-99fb-4788-aca5-ab44c15d1498', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-05 22:42:27.831727+00');
INSERT INTO public.channel_agents VALUES ('channel_a1b78fb9-19cd-497d-8f9a-1277664da73c', 'seo-agent', '2026-10-05 23:13:49.144334+00');
INSERT INTO public.channel_agents VALUES ('channel_e04ec0cb-0223-4a9a-9a5c-962fb8c0ce8b', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-17 09:18:27.15673+00');
INSERT INTO public.channel_agents VALUES ('channel_ed211a4e-34f9-41ca-a9b0-d837d3f4195c', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-17 09:18:28.08319+00');
INSERT INTO public.channel_agents VALUES ('channel_3b154602-a485-4290-a340-95f1c259e73f', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-17 09:18:28.643433+00');
INSERT INTO public.channel_agents VALUES ('channel_5ea69222-aece-4b33-8464-85fd467a2890', 'agent_b3a45862-1825-469f-ac71-4f114c34432a', '2026-10-17 09:18:28.924905+00');


--
-- Data for Name: channel_memberships; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.channel_memberships VALUES ('channel_80d3640c-2788-4324-82f1-7e0ae85b3847', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', '2026-09-30 20:32:09.898108+00', NULL, '2026-10-04 14:44:27.422353+00');
INSERT INTO public.channel_memberships VALUES ('channel_cf2c112d-c3a6-4d07-8536-239682d03ba9', 'zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', '2026-10-04 14:48:51.114772+00', NULL, '2026-10-04 15:13:54.977453+00');
INSERT INTO public.channel_memberships VALUES ('channel_87f7e789-0c34-4f74-aab1-5ba611ba3f02', 'zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', '2026-10-04 14:47:45.002971+00', NULL, '2026-10-04 15:31:17.12024+00');
INSERT INTO public.channel_memberships VALUES ('channel_c388ddeb-d4bc-492b-9f62-e30e92ab136b', 'zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', '2026-10-04 17:31:09.846959+00', NULL, '2026-10-04 17:31:14.415735+00');
INSERT INTO public.channel_memberships VALUES ('channel_8e98acac-99fb-4788-aca5-ab44c15d1498', 'zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', '2026-10-05 22:42:27.831727+00', NULL, '2026-10-05 22:43:24.424787+00');
INSERT INTO public.channel_memberships VALUES ('channel_a1b78fb9-19cd-497d-8f9a-1277664da73c', 'b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L', '2026-10-05 23:13:49.144334+00', NULL, NULL);
INSERT INTO public.channel_memberships VALUES ('channel_e04ec0cb-0223-4a9a-9a5c-962fb8c0ce8b', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', '2026-10-17 09:18:27.15673+00', NULL, NULL);
INSERT INTO public.channel_memberships VALUES ('channel_ed211a4e-34f9-41ca-a9b0-d837d3f4195c', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', '2026-10-17 09:18:28.08319+00', NULL, NULL);
INSERT INTO public.channel_memberships VALUES ('channel_3b154602-a485-4290-a340-95f1c259e73f', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', '2026-10-17 09:18:28.643433+00', NULL, NULL);
INSERT INTO public.channel_memberships VALUES ('channel_5ea69222-aece-4b33-8464-85fd467a2890', 'Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', '2026-10-17 09:18:28.924905+00', NULL, '2026-10-17 09:26:20.360948+00');


--
-- Data for Name: connect_media; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: connect_pc_agent_links; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: connect_pc_jobs; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: connect_pc_workers; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.connect_pc_workers VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'DESKTOP-KA3V060-10096', 'PC DESKTOP-KA3V060', 'pc-bridge 1', '[{"kind": "codex-cli", "label": "Codex (ChatGPT-Login)", "ready": true, "detail": "Bereit · codex-cli 0.160.1", "models": ["gpt-5.5", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-luna"]}, {"kind": "claude-cli", "label": "Claude (Claude-Login)", "ready": false, "detail": "Nicht angemeldet", "models": ["sonnet", "opus", "haiku"]}, {"kind": "grok-bot", "label": "Grok Bot", "ready": false, "detail": "{\"error\":{\"code\":\"render-failed\",\"message\":\"An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.\"}}", "models": []}]', '[]', '2026-10-17 09:33:14.929743+00');


--
-- Data for Name: connect_workspace_kv; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.connect_workspace_kv VALUES ('u:k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD:connect.account', '"{\"userId\":\"k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD\",\"email\":\"cntconnect3@gmail.com\",\"name\":\"CNTConnect 3\",\"updatedAt\":\"2026-10-01T17:50:24.112Z\"}"', '2026-10-01 17:50:24.112+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD:connect-theme', '"\"light\""', '2026-10-01 17:50:24.112+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD:connect.projects', '"[{\"id\":\"nordwind-delivered-mupsr7if\",\"companyId\":\"nordwind\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#ca8a04\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[\"connect\",\"consensus\"]},{\"id\":\"nordwind-research-mupsr7if\",\"companyId\":\"nordwind\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#7c3aed\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[\"hyper\",\"spark\"]},{\"id\":\"nordwind-zentrale-mupsr7if\",\"companyId\":\"nordwind\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0f766e\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"cto\",\"analysis\",\"flux\"]}]"', '2026-10-01 17:50:24.112+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD:connect.activeCompanyId', '"\"nordwind\""', '2026-10-01 17:50:24.112+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:k0kzLAp09p7GrNGpj6TVQw6Q7xZn92YD:connect.activeLevel', '"3"', '2026-10-01 17:50:24.112+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.activeCompanyId', '"\"nordwind\""', '2026-10-04 14:47:08.661+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.companies.custom', '"[{\"id\":\"nordwind\",\"name\":\"Nordwind\",\"handle\":\"nordwind\",\"description\":\"Operations and analysis — keep work moving with clear findings.\",\"agentIds\":[\"cto\",\"analysis\",\"flux\",\"hyper\",\"spark\",\"connect\",\"consensus\",\"agent_b3a45862-1825-469f-ac71-4f114c34432a\"],\"accent\":\"linear-gradient(145deg, #0f766e 0%, #164e63 55%, #1e293b 100%)\",\"logo\":\"/companies/nordwind.png?v=5\",\"category\":\"Operations company\",\"location\":\"Remote\",\"website\":\"nordwind.local\"}]"', '2026-10-04 12:10:26.441+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.activeLevel', '3', '2026-10-17 09:30:02.995+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect.account', '{"name": "Stefan Kunc", "email": "stefankunc994@gmail.com", "userId": "zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm", "updatedAt": "2026-10-05T22:59:53.776Z"}', '2026-10-05 22:59:53.776+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.projects', '"[{\"id\":\"\\\"nordwind\\\"-delivered-mutsip5a\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#15803d\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[]},{\"id\":\"\\\"nordwind\\\"-research-mutsip59\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#be123c\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[]},{\"id\":\"\\\"nordwind\\\"-zentrale-mutsip59\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0369a1\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"agent_b3a45862-1825-469f-ac71-4f114c34432a\"]},{\"id\":\"nordwind-delivered-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#ca8a04\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[\"connect\",\"consensus\"]},{\"id\":\"nordwind-research-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#7c3aed\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[\"hyper\",\"spark\"]},{\"id\":\"nordwind-zentrale-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0f766e\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"cto\",\"analysis\",\"flux\"]}]"', '2026-10-04 17:30:03.724+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect-theme', '"light"', '2026-10-17 09:30:53.028+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.account', '{"name": "Stefan Kunc", "email": "dailyfunde.yt@gmail.com", "userId": "Xx3DRBa5O38j5I50bcmQxbhvDyHziizu", "updatedAt": "2026-10-17T09:30:53.028Z"}', '2026-10-17 09:30:53.028+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.level3.browser', '{"nordwind": {"engine": "full", "starred": false, "browsing": true, "companyId": "nordwind", "customUrl": "https://de.tradingview.com", "tabGroups": [{"id": "group-mupsl5wn", "label": "Hallo", "appIds": [], "collapsed": false}, {"id": "group-mupslvkn", "label": "Hallo", "appIds": [], "collapsed": false}], "updatedAt": "2026-10-01T17:21:06.988Z", "activeTool": "tradingview", "customApps": [{"id": "split-example-notion-tradingview", "url": "https://www.notion.so", "icon": "notion", "kind": "split", "tint": "#111111", "url2": "https://de.tradingview.com/chart/", "blurb": "Split-Link (Beispiel – Rechtsklick › Bearbeiten)", "label": "Notion + TradingView", "builtin": false}], "connections": [], "splitExampleSeeded": true, "connect.level3.migrated.v2-cleared-defaults": true}}', '2026-10-17 09:19:17.86+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.company-posts', '"[{\"id\":\"nordwind-muok5ehl-7khvgb\",\"companyId\":\"nordwind\",\"kind\":\"update\",\"title\":\"Private · Routing note\",\"body\":\"Spark keeps private triage notes here — not shown on the employee wall.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"private\",\"source\":\"manual\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\"},{\"id\":\"nordwind-muok5ehl-empjwc\",\"companyId\":\"nordwind\",\"kind\":\"task\",\"title\":\"Linear → LUM-184\",\"body\":\"Ship Q-ready brief. Acceptance: sources attached, draft in Drive, @reviewers notified.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"linear\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"analysis\",\"assignedToName\":\"Analysis\",\"externalFrom\":\"Linear · LUM-184\"},{\"id\":\"nordwind-muok5ehl-qppanw\",\"companyId\":\"nordwind\",\"kind\":\"chat\",\"title\":\"Slack → Inbox\",\"body\":\"@channel can Spark pick up the customer brief from #product? Need a status by EOD.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"slack\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"cto\",\"assignedToName\":\"Cto\",\"externalFrom\":\"#product · Maya\"},{\"id\":\"nordwind-muok5ehl-45ra93\",\"companyId\":\"nordwind\",\"kind\":\"goal\",\"title\":\"North star · Nordwind\",\"body\":\"Every employee should understand this goal. Edit or replace it — this pinned post is the company mission.\",\"pinned\":true,\"authorName\":\"Leadership\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"manual\"}]"', '2026-10-04 12:10:26.441+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect.projects', '"[{\"id\":\"nordwind-delivered-mutxqxq0\",\"companyId\":\"nordwind\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#ca8a04\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[\"connect\",\"consensus\"]},{\"id\":\"nordwind-research-mutxqxq0\",\"companyId\":\"nordwind\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#7c3aed\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[\"hyper\",\"spark\"]},{\"id\":\"nordwind-zentrale-mutxqxpz\",\"companyId\":\"nordwind\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0f766e\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"cto\",\"analysis\",\"flux\"]}]"', '2026-10-04 14:48:05.967+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect.level3.browser', '"{\"\\\"nordwind\\\"\":{\"companyId\":\"\\\"nordwind\\\"\",\"activeTool\":\"lovable\",\"browsing\":true,\"connections\":[],\"starred\":false,\"customApps\":[{\"id\":\"split-example-notion-tradingview\",\"kind\":\"split\",\"label\":\"Notion + TradingView\",\"blurb\":\"Split-Link (Beispiel – Rechtsklick › Bearbeiten)\",\"url\":\"https://www.notion.so\",\"url2\":\"https://de.tradingview.com/chart/\",\"icon\":\"notion\",\"tint\":\"#111111\",\"builtin\":false}],\"tabGroups\":[{\"id\":\"group-technische\",\"label\":\"Technische\",\"accent\":\"technische\",\"appIds\":[\"split-example-notion-tradingview\",\"tradingview\",\"markettrace\",\"btcusdt\",\"prorealtime\",\"plattform\"],\"collapsed\":true},{\"id\":\"group-fundamentals\",\"label\":\"Fundamentals\",\"accent\":\"fundamentals\",\"appIds\":[],\"collapsed\":false},{\"id\":\"group-sentimentalle\",\"label\":\"Sentimentalle\",\"accent\":\"sentimentalle\",\"appIds\":[\"cryptopanic\",\"allcategories\"],\"collapsed\":false},{\"id\":\"group-sektorielle\",\"label\":\"Sektorielle\",\"accent\":\"sektorielle\",\"appIds\":[]},{\"id\":\"group-build\",\"label\":\"Build\",\"accent\":\"build\",\"appIds\":[\"lovable\",\"cursor\",\"github\",\"laravel\"]},{\"id\":\"group-ai\",\"label\":\"AI\",\"accent\":\"ai\",\"appIds\":[\"claude\",\"chatgpt\"],\"collapsed\":false}],\"engine\":\"full\",\"updatedAt\":\"2026-10-04T19:26:58.633Z\",\"splitExampleSeeded\":true}}"', '2026-10-04 19:27:02.269+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.company-posts.from-helium-20261004', '"[{\"id\":\"nordwind-muok5ehl-7khvgb\",\"companyId\":\"nordwind\",\"kind\":\"update\",\"title\":\"Private ┬À Routing note\",\"body\":\"Spark keeps private triage notes here ÔÇö not shown on the employee wall.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"private\",\"source\":\"manual\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\"},{\"id\":\"nordwind-muok5ehl-empjwc\",\"companyId\":\"nordwind\",\"kind\":\"task\",\"title\":\"Linear ÔåÆ LUM-184\",\"body\":\"Ship Q-ready brief. Acceptance: sources attached, draft in Drive, @reviewers notified.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"linear\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"analysis\",\"assignedToName\":\"Analysis\",\"externalFrom\":\"Linear ┬À LUM-184\"},{\"id\":\"nordwind-muok5ehl-qppanw\",\"companyId\":\"nordwind\",\"kind\":\"chat\",\"title\":\"Slack ÔåÆ Inbox\",\"body\":\"@channel can Spark pick up the customer brief from #product? Need a status by EOD.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"slack\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"cto\",\"assignedToName\":\"Cto\",\"externalFrom\":\"#product ┬À Maya\"},{\"id\":\"nordwind-muok5ehl-45ra93\",\"companyId\":\"nordwind\",\"kind\":\"goal\",\"title\":\"North star ┬À Nordwind\",\"body\":\"Every employee should understand this goal. Edit or replace it ÔÇö this pinned post is the company mission.\",\"pinned\":true,\"authorName\":\"Leadership\",\"createdAt\":\"2026-09-30T20:28:32.793Z\",\"visibility\":\"public\",\"source\":\"manual\"}]"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect.activeLevel', '2', '2026-10-05 22:59:53.776+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.company-posts.from-app-20261004', '"[{\"id\":\"nordwind-mupuhvz0-j445cm\",\"companyId\":\"nordwind\",\"kind\":\"update\",\"title\":\"Private ┬À Routing note\",\"body\":\"Spark keeps private triage notes here ÔÇö not shown on the employee wall.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-10-01T18:05:57.660Z\",\"visibility\":\"private\",\"source\":\"manual\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\"},{\"id\":\"nordwind-mupuhvz0-hk02zq\",\"companyId\":\"nordwind\",\"kind\":\"task\",\"title\":\"Linear ÔåÆ LUM-184\",\"body\":\"Ship Q-ready brief. Acceptance: sources attached, draft in Drive, @reviewers notified.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-10-01T18:05:57.660Z\",\"visibility\":\"public\",\"source\":\"linear\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"analysis\",\"assignedToName\":\"Analysis\",\"externalFrom\":\"Linear ┬À LUM-184\"},{\"id\":\"nordwind-mupuhvz0-1h3s1n\",\"companyId\":\"nordwind\",\"kind\":\"chat\",\"title\":\"Slack ÔåÆ Inbox\",\"body\":\"@channel can Spark pick up the customer brief from #product? Need a status by EOD.\",\"pinned\":false,\"authorName\":\"Spark\",\"createdAt\":\"2026-10-01T18:05:57.660Z\",\"visibility\":\"public\",\"source\":\"slack\",\"inboxBotId\":\"spark\",\"inboxBotName\":\"Spark\",\"assignedToId\":\"cto\",\"assignedToName\":\"Cto\",\"externalFrom\":\"#product ┬À Maya\"},{\"id\":\"nordwind-mupuhvyz-jfmvhy\",\"companyId\":\"nordwind\",\"kind\":\"goal\",\"title\":\"North star ┬À Nordwind\",\"body\":\"Every employee should understand this goal. Edit or replace it ÔÇö this pinned post is the company mission.\",\"pinned\":true,\"authorName\":\"Leadership\",\"createdAt\":\"2026-10-01T18:05:57.659Z\",\"visibility\":\"public\",\"source\":\"manual\"}]"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.level3.browser.from-helium-20261004', '"{\"nordwind\":{\"companyId\":\"nordwind\",\"activeTool\":\"tradingview\",\"browsing\":true,\"connections\":[],\"starred\":false,\"customApps\":[{\"id\":\"split-example-notion-tradingview\",\"kind\":\"split\",\"label\":\"Notion + TradingView\",\"blurb\":\"Split-Link (Beispiel ÔÇô Rechtsklick ÔÇ║ Bearbeiten)\",\"url\":\"https://www.notion.so\",\"url2\":\"https://de.tradingview.com/chart/\",\"icon\":\"notion\",\"tint\":\"#111111\",\"builtin\":false}],\"tabGroups\":[{\"id\":\"group-technische\",\"label\":\"Technische\",\"accent\":\"technische\",\"appIds\":[\"split-example-notion-tradingview\",\"tradingview\",\"markettrace\",\"btcusdt\",\"prorealtime\",\"plattform\"],\"collapsed\":false},{\"id\":\"group-fundamentals\",\"label\":\"Fundamentals\",\"accent\":\"fundamentals\",\"appIds\":[],\"collapsed\":true},{\"id\":\"group-sentimentalle\",\"label\":\"Sentimentalle\",\"accent\":\"sentimentalle\",\"appIds\":[\"cryptopanic\",\"allcategories\"],\"collapsed\":true},{\"id\":\"group-sektorielle\",\"label\":\"Sektorielle\",\"accent\":\"sektorielle\",\"appIds\":[\"lovable\"],\"collapsed\":false},{\"id\":\"group-build\",\"label\":\"Build\",\"accent\":\"build\",\"appIds\":[\"cursor\",\"github\",\"laravel\"]},{\"id\":\"group-ai\",\"label\":\"AI\",\"accent\":\"ai\",\"appIds\":[\"claude\",\"chatgpt\"]},{\"id\":\"group-mupsl5wn\",\"label\":\"Hallo\",\"appIds\":[],\"collapsed\":false},{\"id\":\"group-mupslvkn\",\"label\":\"Hallo\",\"appIds\":[],\"collapsed\":false}],\"engine\":\"full\",\"updatedAt\":\"2026-10-01T17:21:06.988Z\",\"customUrl\":\"https://de.tradingview.com\",\"splitExampleSeeded\":true}}"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.level3.browser.from-app-20261004', '"{\"nordwind\":{\"companyId\":\"nordwind\",\"activeTool\":\"tradingview\",\"tabGroups\":[{\"label\":\"Technische\",\"collapsed\":false,\"accent\":\"technische\",\"id\":\"group-technische\",\"appIds\":[\"tradingview\",\"markettrace\",\"btcusdt\",\"prorealtime\",\"plattform\"]},{\"label\":\"Fundamentals\",\"accent\":\"fundamentals\",\"id\":\"group-fundamentals\",\"appIds\":[]},{\"label\":\"Sentimentalle\",\"accent\":\"sentimentalle\",\"id\":\"group-sentimentalle\",\"appIds\":[\"cryptopanic\",\"allcategories\"]},{\"label\":\"Sektorielle\",\"accent\":\"sektorielle\",\"id\":\"group-sektorielle\",\"appIds\":[]},{\"label\":\"Build\",\"accent\":\"build\",\"id\":\"group-build\",\"appIds\":[\"lovable\",\"cursor\",\"github\",\"laravel\"]},{\"label\":\"AI\",\"accent\":\"ai\",\"id\":\"group-ai\",\"appIds\":[\"claude\",\"chatgpt\"]}],\"customApps\":[],\"engine\":\"full\",\"updatedAt\":\"2026-10-01T17:41:58.9213859Z\",\"connections\":[],\"splitExampleSeeded\":true,\"browsing\":true,\"starred\":false}}"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.projects.from-helium-20261004', '"[{\"id\":\"\\\"nordwind\\\"-delivered-mutsip5a\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#15803d\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[]},{\"id\":\"\\\"nordwind\\\"-research-mutsip59\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#be123c\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[]},{\"id\":\"\\\"nordwind\\\"-zentrale-mutsip59\",\"companyId\":\"\\\"nordwind\\\"\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0369a1\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"agent_b3a45862-1825-469f-ac71-4f114c34432a\"]},{\"id\":\"nordwind-delivered-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#ca8a04\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[\"connect\",\"consensus\"]},{\"id\":\"nordwind-research-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#7c3aed\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[\"hyper\",\"spark\"]},{\"id\":\"nordwind-zentrale-muojld4w\",\"companyId\":\"nordwind\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0f766e\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"cto\",\"analysis\",\"flux\"]}]"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:Xx3DRBa5O38j5I50bcmQxbhvDyHziizu:connect.projects.from-app-20261004', '"[{\"id\":\"nordwind-delivered-muptpybz\",\"companyId\":\"nordwind\",\"name\":\"Delivered\",\"description\":\"Issues, cycles, and shipping.\",\"accent\":\"#ca8a04\",\"logo\":\"/apps/linear.png\",\"appFolder\":\"linear\",\"agentIds\":[\"connect\",\"consensus\"]},{\"id\":\"nordwind-research-muptpybz\",\"companyId\":\"nordwind\",\"name\":\"Research\",\"description\":\"Browse, collect, and brief.\",\"accent\":\"#7c3aed\",\"logo\":\"/apps/arc.png\",\"appFolder\":\"arc\",\"agentIds\":[\"hyper\",\"spark\"]},{\"id\":\"nordwind-zentrale-muptpybz\",\"companyId\":\"nordwind\",\"name\":\"Zentrale\",\"description\":\"Leadership and day-to-day ops.\",\"accent\":\"#0f766e\",\"logo\":\"/apps/slack.png\",\"appFolder\":\"slack\",\"agentIds\":[\"cto\",\"analysis\",\"flux\"]}]"', '2026-10-04 12:26:29.494164+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect.activeCompanyId', '"\"nordwind\""', '2026-10-04 16:06:45.865+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm:connect-theme', '"\"light\""', '2026-10-05 22:36:35.072+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L:connect-theme', '"light"', '2026-10-05 23:13:30.79+00');
INSERT INTO public.connect_workspace_kv VALUES ('u:b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L:connect.account', '{"name": "Stefan Kunc", "email": "dailyfunen.yt@gmail.com", "userId": "b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L", "updatedAt": "2026-10-05T23:13:30.790Z"}', '2026-10-05 23:13:30.79+00');


--
-- Data for Name: intelligence_channel_mappings; Type: TABLE DATA; Schema: public; Owner: connect_app
--

INSERT INTO public.intelligence_channel_mappings VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'channel_80d3640c-2788-4324-82f1-7e0ae85b3847', 'ef260e9a-a3c6-81ee-b11a-4aacaa9fe394', '2026-09-30 20:32:09.898108+00', '2026-09-30 20:32:09.898108+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', 'channel_87f7e789-0c34-4f74-aab1-5ba611ba3f02', 'ef260e9a-a3c6-8082-b7d8-2adb5fbd94a5', '2026-10-04 14:47:45.002971+00', '2026-10-04 14:47:45.002971+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', 'channel_cf2c112d-c3a6-4d07-8536-239682d03ba9', 'ef260e9a-a3c6-8a8d-b505-a3c3424fa28d', '2026-10-04 14:48:51.114772+00', '2026-10-04 14:48:51.114772+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', 'channel_c388ddeb-d4bc-492b-9f62-e30e92ab136b', 'ef260e9a-a3c6-8d6e-ba0b-711b5260e69d', '2026-10-04 17:31:09.846959+00', '2026-10-04 17:31:09.846959+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('zYiSbjz7Qv3z9AqvJhVYCFe3kLq1Gtjm', 'channel_8e98acac-99fb-4788-aca5-ab44c15d1498', 'ef260e9a-a3c6-8fa0-8d32-70c015f71cab', '2026-10-05 22:42:27.831727+00', '2026-10-05 22:42:27.831727+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('b3SYZ2SfoVFLeobUynfpWPR4T1Z4437L', 'channel_a1b78fb9-19cd-497d-8f9a-1277664da73c', 'ef260e9a-a3c6-80aa-8a40-55171db72087', '2026-10-05 23:13:49.144334+00', '2026-10-05 23:13:49.144334+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'channel_e04ec0cb-0223-4a9a-9a5c-962fb8c0ce8b', 'ef260e9a-a3c6-885b-88ea-18715c11f187', '2026-10-17 09:18:27.15673+00', '2026-10-17 09:18:27.15673+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'channel_ed211a4e-34f9-41ca-a9b0-d837d3f4195c', 'ef260e9a-a3c6-866d-ac56-a03186e7b73d', '2026-10-17 09:18:28.08319+00', '2026-10-17 09:18:28.08319+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'channel_3b154602-a485-4290-a340-95f1c259e73f', 'ef260e9a-a3c6-8adf-816f-39f4c2701606', '2026-10-17 09:18:28.643433+00', '2026-10-17 09:18:28.643433+00');
INSERT INTO public.intelligence_channel_mappings VALUES ('Xx3DRBa5O38j5I50bcmQxbhvDyHziizu', 'channel_5ea69222-aece-4b33-8464-85fd467a2890', 'ef260e9a-a3c6-8566-bc22-2bb9d4b39223', '2026-10-17 09:18:28.924905+00', '2026-10-17 09:18:28.924905+00');


--
-- Data for Name: routines; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: skills; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: skill_tools; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- Data for Name: user_instructions; Type: TABLE DATA; Schema: public; Owner: connect_app
--



--
-- PostgreSQL database dump complete
--

\unrestrict anBLtCIO7ZNZ8BpL1ArGHgL6LcGTywaWcJPw4PodnvkiS9z3dT3AXed2WbIuKVg

