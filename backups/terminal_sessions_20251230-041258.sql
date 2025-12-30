--
-- PostgreSQL database dump
--

\restrict BvLyjGL8AGamUsO3rRFADKRspv0mPqTf5UUXKZZ5vhE9DPPgoy4qRXtw5MvJXGQ

-- Dumped from database version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: terminal_sessions; Type: TABLE; Schema: public; Owner: summitflow_app
--

CREATE TABLE public.terminal_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    user_id text,
    project_id text,
    working_dir text,
    display_order integer DEFAULT 0 NOT NULL,
    is_alive boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    last_claude_session character varying(255),
    mode character varying(16) DEFAULT 'shell'::character varying,
    claude_state character varying(16) DEFAULT 'not_started'::character varying,
    CONSTRAINT terminal_sessions_claude_state_check CHECK (((claude_state)::text = ANY ((ARRAY['not_started'::character varying, 'starting'::character varying, 'running'::character varying, 'stopped'::character varying, 'error'::character varying])::text[]))),
    CONSTRAINT terminal_sessions_mode_check CHECK (((mode)::text = ANY ((ARRAY['shell'::character varying, 'claude'::character varying])::text[])))
);


ALTER TABLE public.terminal_sessions OWNER TO summitflow_app;

--
-- Data for Name: terminal_sessions; Type: TABLE DATA; Schema: public; Owner: summitflow_app
--

COPY public.terminal_sessions (id, name, user_id, project_id, working_dir, display_order, is_alive, created_at, last_accessed_at, last_claude_session, mode, claude_state) FROM stdin;
76a26b95-e5d2-4093-aa02-c42332d5d4f2	Terminal 1	\N	\N	\N	0	f	2025-12-29 14:59:12.709133-05	2025-12-29 15:05:27.884123-05	\N	shell	not_started
45eb5e10-6001-4ce8-afd6-fa1357ad4be7	Terminal 1	\N	\N	/home/kasadis	0	f	2025-12-29 01:42:54.058452-05	2025-12-29 08:12:37.8787-05	\N	shell	not_started
9ac12952-012e-42bc-84e4-f690262ecfe0	Terminal 2	\N	\N	/home/kasadis	0	f	2025-12-29 01:42:58.743647-05	2025-12-29 08:12:38.134032-05	\N	shell	not_started
7282fef7-5365-442d-ac54-bb1485414c02	Terminal 1	\N	\N	\N	0	f	2025-12-29 15:06:15.384851-05	2025-12-29 15:10:54.115494-05	\N	shell	not_started
05f26abb-ae0a-45cc-8709-ddaff157e077	Project: summitflow	\N	summitflow	/home/kasadis/summitflow	0	t	2025-12-29 21:50:28.683345-05	2025-12-30 04:12:09.154062-05	\N	shell	not_started
0aa7ba28-4e94-4a61-9aca-bd1e3a1a5594	Project: portfolio-ai	\N	portfolio-ai	/home/kasadis/portfolio-ai	0	t	2025-12-30 04:10:16.49125-05	2025-12-30 04:12:09.347718-05	\N	shell	not_started
64eed6db-3e1d-4580-8e5f-954c45c6ead2	Test	\N	portfolio-ai	/home/kasadis/portfolio-ai	0	t	2025-12-30 04:10:16.562868-05	2025-12-30 04:12:09.544191-05	\N	claude	running
cf03e7cf-7694-4c2b-9ec9-78f6de59496d	Project: terminal	\N	terminal	/home/kasadis/terminal	0	t	2025-12-30 04:10:19.792915-05	2025-12-30 04:12:09.789945-05	\N	shell	not_started
801b5a0d-264b-4e58-9eae-dc1d4597b8ff	Project: terminal	\N	terminal	/home/kasadis/terminal	0	t	2025-12-30 04:10:19.834442-05	2025-12-30 04:12:09.979108-05	\N	claude	running
b062866a-48ef-4aca-8a67-75e300da1e32	Project: summitflow	\N	summitflow	/home/kasadis/summitflow	0	t	2025-12-30 04:10:33.450787-05	2025-12-30 04:12:10.178799-05	\N	claude	running
8777f8c5-c0a0-44d3-8ed6-5463690deae0	Terminal 1	\N	\N	/home/kasadis	0	f	2025-12-26 09:03:56.234659-05	2025-12-28 22:56:46.968132-05	\N	shell	not_started
ca118210-2dc7-4826-82e0-aeff45d18285	Terminal 2	\N	\N	/home/kasadis	0	f	2025-12-26 16:50:01.284778-05	2025-12-28 22:56:47.185415-05	\N	shell	not_started
\.


--
-- Name: terminal_sessions terminal_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: summitflow_app
--

ALTER TABLE ONLY public.terminal_sessions
    ADD CONSTRAINT terminal_sessions_pkey PRIMARY KEY (id);


--
-- Name: idx_terminal_sessions_alive; Type: INDEX; Schema: public; Owner: summitflow_app
--

CREATE INDEX idx_terminal_sessions_alive ON public.terminal_sessions USING btree (is_alive);


--
-- Name: idx_terminal_sessions_project_mode; Type: INDEX; Schema: public; Owner: summitflow_app
--

CREATE UNIQUE INDEX idx_terminal_sessions_project_mode ON public.terminal_sessions USING btree (project_id, mode) WHERE (project_id IS NOT NULL);


--
-- Name: idx_terminal_sessions_user; Type: INDEX; Schema: public; Owner: summitflow_app
--

CREATE INDEX idx_terminal_sessions_user ON public.terminal_sessions USING btree (user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict BvLyjGL8AGamUsO3rRFADKRspv0mPqTf5UUXKZZ5vhE9DPPgoy4qRXtw5MvJXGQ

