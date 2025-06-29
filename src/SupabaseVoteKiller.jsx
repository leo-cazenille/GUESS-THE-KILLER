// SupabaseVoteKiller.jsx
// -----------------------------------------------------------------------------------------------
// Voting demo – React + Vite + Supabase  (patched 2025-06-29)
//
//
// Everything else (21-minute window, two-tab layout, CSV loads, etc.) is unchanged.
//
// -----------------------------------------------------------------------------------------------

import React, { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import ReactPlayer from "react-player/youtube";
import Papa from "papaparse";
import { QRCodeCanvas as QRCode } from "qrcode.react";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  LineController,
  TimeScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  LineController,
  TimeScale,
  Tooltip,
  Legend
);



// ------------------------------------ CONFIG ----------------------------------------------------
const ONE_SECOND   = 1_000;
const WAIT_MINUTES = 21;
const WAIT_SECONDS = WAIT_MINUTES * 60;
const WAIT_MS      = WAIT_SECONDS * ONE_SECOND;

const SHOW_SIDEBAR_HISTOGRAM = true;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
window.supabase = supabase; // dev helper

// Suspects ------------------------------------------------------------------
const NAMES = [
  "D. Poiré",
  "Jane Blond",
  "D. Doubledork",
  "The Director",
  "Dr. Lafayette",     // id 5 – killer
  "Spiderman",
  "Mew the Ripper",
  "Researcher Catnip",
  "QTRobot",
  "Pepper",
  "Freaky Franka",
  "Greta",
];

// Couleurs spécifiques pour chaque personnage (style Cluedo) - The Director et Spiderman échangés
const CHARACTER_COLORS = [
  "#8B0000",   // 1. D. Poiré - Rouge foncé
  "#008B8B",   // 2. Jane Blond - Bleu-vert foncé
  "#B8860B",   // 3. D. Doubledork - Or foncé
  "#2F4F4F",   // 4. The Director - Gris ardoise foncé
  "#228B22",   // 5. Dr. Lafayette - Vert forêt
  "#4B0082",   // 6. Spiderman - Indigo foncé
  "#8B008B",   // 7. Mew the ripper - Violet foncé
  "#8B4513",   // 8. Researcher Catnip - Marron selle
  "#191970",   // 9. QTRobot - Bleu marine
  "#654321",   // 10. Pepper - Marron foncé
  "#A0522D",   // 11. Freaky Franka - Marron sienna
  "#DAA520",   // 12. Greta - Or pâle
];

const asset  = (p) => `${import.meta.env.BASE_URL}${p}`;
const IMAGES = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  src: asset(`photos/${i + 1}.jpg`),
  color: CHARACTER_COLORS[i],
}));

const REAL_KILLER_ID   = 5;
const REAL_KILLER_NAME = NAMES[REAL_KILLER_ID - 1];

// ---------------------------------- CSV HELPERS -------------------------------------------------
const normal = (s = "") =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")            // split é → e + ́
    .replace(/[\u0300-\u036f]/g, "") // drop diacritics
    .replace(/[^\w\s.]/g, "");   // remove stray � or other symbols

async function loadCsv(relPath) {
  const res = await fetch(asset(relPath));
  const buf = await res.arrayBuffer();
  let txt   = new TextDecoder("utf-8").decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("iso-8859-1").decode(buf); // fallback
  return new Promise((res) =>
    Papa.parse(txt, {
      header: true,
      skipEmptyLines: true,
      complete: (out) => res(out.data),
    })
  );
}

const fmtMMSS = (sec) =>
  `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;

/** One-time scenario data (characters / clues / topics) */
function useScenarioData() {
  const [charTimes, setCharTimes] = useState(new Map()); // Map(normalName → time)
  const [clues, setClues]         = useState([]);        // [{time, text}]
  const [topics, setTopics]       = useState([]);        // [{time, title}]

  useEffect(() => {
    (async () => {
      const [charRows, clueRows, topicRows] = await Promise.all([
        loadCsv("characters.csv"),
        loadCsv("clues.csv"),
        loadCsv("topics.csv"),
      ]);

      // characters.csv
      const cMap = new Map();
      charRows.forEach((r) => {
        const n = normal(r.character ?? r.Character ?? "");
        const t = parseFloat(r.time ?? r.Time ?? 0);
        if (n) cMap.set(n, t);
      });
      setCharTimes(cMap);

      // clues.csv
      setClues(
        clueRows
          .map((r) => ({
            time: parseFloat(r.time ?? r.Time ?? 0),
            text: (r.clue ?? r.Clue ?? "").trim(),
          }))
          .filter((r) => r.text)
      );

      // topics.csv
      setTopics(
        topicRows
          .map((r) => ({
            time: parseFloat(r.time ?? r.Time ?? 0),
            title: (r.title ?? r.Title ?? "").trim(),
            desc: (r.acide_topic ?? r.Acide_topic ?? "").trim(),
          }))
          .filter((r) => r.title)
      );
    })();
  }, []);

  return { charTimes, clues, topics };
}

// ---------------------------------- SHARED RESET (unchanged) ------------------------------------
async function resetAllAndNotify() {
  await Promise.all([
    supabase.from("votes").delete().gt("image_id", 0),
    supabase.from("scores").delete().gt("score", -1),
    supabase.from("video_session").upsert({ id: 1, started_at: null }),
  ]);
  localStorage.setItem("votes_reset", Date.now().toString());
}

// ------------------------------------------ VOTE GRID -------------------------------------------
function VoteGrid() {
  const { charTimes, clues, topics } = useScenarioData();

  const [user, setUser]      = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSel]   = useState(null);
  const [videoStart, setVS]  = useState(0);          // ms epoch
  const [now, setNow]        = useState(Date.now());
  const [tab, setTab]        = useState("vote");     // "vote" | "info"

  // clock --------------------------------------------------------------------
  useEffect(() => {
    if (!videoStart) return;
    const id = setInterval(() => setNow(Date.now()), ONE_SECOND);
    return () => clearInterval(id);
  }, [videoStart]);

  const elapsedSec = videoStart ? (now - videoStart) / 1000 : 0;

  // ask name once ------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      const n = prompt("Enter your name to vote:")?.trim();
      if (n) {
        setUser(n);
        localStorage.setItem("voter_name", n);
      }
    }
  }, [user]);

  // fetch previous vote ------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("votes")
        .select("image_id")
        .eq("user_name", user)
        .single();
      if (data) setSel(data.image_id);
    })();
  }, [user]);

  // poll video_session until started_at --------------------------------------
  useEffect(() => {
    if (videoStart) return;
    const poll = async () => {
      const { data } = await supabase
        .from("video_session")
        .select("started_at")
        .eq("id", 1)
        .maybeSingle();
      if (data?.started_at) setVS(Date.parse(data.started_at));
    };
    poll();
    const id = setInterval(poll, ONE_SECOND);
    return () => clearInterval(id);
  }, [videoStart]);

  // continuous scoring -------------------------------------------------------
  const killerMsRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (!videoStart) return;

    const pushScore = async () => {
      const now = Date.now();
      const dt  = now - lastTickRef.current;
      lastTickRef.current = now;

      if (selected === REAL_KILLER_ID) killerMsRef.current += dt;

      const pct = Math.min(100, (killerMsRef.current / WAIT_MS) * 100).toFixed(1);
      await supabase.from("scores").upsert(
        { user_name: user || "(anonymous)", score: Number(pct) },
        { onConflict: "user_name" }
      );
    };

    pushScore();
    const id = setInterval(() => {
      if (Date.now() - videoStart >= WAIT_MS) clearInterval(id);
      pushScore();
    }, 3_000);

    return () => clearInterval(id);
  }, [videoStart, selected, user]);

  // vote handler -------------------------------------------------------------
  const vote = async (id) => {
    if (!videoStart) return; // no votes before movie starts

    const img = IMAGES.find((i) => i.id === id);
    if (!img) return;

    const appearAt = charTimes.has(normal(img.name))
      ? charTimes.get(normal(img.name))
      : Infinity;
    const available = elapsedSec >= appearAt;

    if (Date.now() - videoStart >= WAIT_MS || !available) return;

    setSel(id);
    await supabase.from("votes").upsert(
      { user_name: user, image_id: id },
      { onConflict: "user_name" }
    );
  };

  const votingClosed = videoStart && Date.now() - videoStart >= WAIT_MS;

  // ---------------------------- Memoised visible clues / topics -------------
  const visibleItems = useMemo(() => {
    const combined = [
      ...clues.map((c) => ({ ...c, kind: "clue" })),
      ...topics.map((t) => ({ ...t, kind: "topic" })),
    ].sort((a, b) => a.time - b.time);
    return combined.filter((e) => elapsedSec >= e.time);
  }, [elapsedSec, clues, topics]);

  // ---------------------------- Tabs header ---------------------------------
  const Tabs = () => (
    <div className="flex justify-center mb-6">
      {[
        ["vote", "Votes"],
        ["info", "Clues / Topics"],
      ].map(([k, label]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={`px-4 py-2 rounded-t-lg text-xl font-semibold
            ${tab === k ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}
            transition-colors`}
        >
          {label}
        </button>
      ))}
    </div>
  );

// -------------------------------- RENDER ----------------------------------
  return (
    <div
      className="
        min-h-screen w-full
        flex flex-col items-center
        px-4 pb-10
      "
    >
      {/* headline ───────────────────────────────────────────────────────── */}
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-center font-['Playfair_Display'] tracking-wide text-amber-100">
        {user ? (
          <>
            And you <span className="text-amber-200 font-['Crimson_Text']">{user}</span>, who do you think is the real killer?
          </>
        ) : (
          "Who do you think is the real killer?"
         )}
      </h1>
      
      {/* tabs header */}
      <Tabs />

      {/* ───────────────── TAB 1 – VOTES ───────────────── */}
      {tab === "vote" && (
        <>
        <p className="text-base sm:text-lg text-center font-['Crimson_Text'] text-amber-200 mb-6 italic">
          The winner is the player who keeps guessing the longest.
          <br />
          Change your guess anytime!
        </p>

        <div className="grid grid-cols-3 gap-3 sm:gap-5 md:gap-7 lg:gap-8">
          {IMAGES.map((img) => {
            const appearAt = charTimes.has(normal(img.name))
              ? charTimes.get(normal(img.name))
              : Infinity;
            const available =
              videoStart && elapsedSec >= appearAt && !votingClosed;
            const greyed = !available;
            const isSel     = selected === img.id;

            return (
              <div
                key={img.id}
                onClick={() => vote(img.id)}
                className={`victorian-frame color-${img.id} cursor-pointer transition-all duration-300
                  ${!available ? "opacity-40 cursor-not-allowed"
                                : isSel ? "scale-[1.06] shadow-[0_0_12px_4px_rgba(255,215,0,0.75)] animate-[pulse-gold_1.4s_ease-in-out_infinite]"
                                         : "hover:scale-[1.04]"}
                `}
                style={{
                  /* double frame: thin when idle, thick when selected */
                  padding: "4px",                            // constant → no reflow
                  border:  "3px double transparent",
                  outline: isSel ? "4px solid #ffd700" : "none",
                  outlineOffset: "-4px",
                  background: isSel
                    ? "linear-gradient(#3182ce,#3182ce) padding-box,\
                       linear-gradient(135deg,#ffd700 0%,#ffef8a 30%,#d4af37 60%,#ffd700 100%) border-box"
                    : "linear-gradient(#1e1e1e,#1e1e1e) padding-box,\
                       linear-gradient(135deg,#ffd700 0%,#ffef8a 30%,#d4af37 60%,#ffd700 100%) border-box",
                }}
              >
                {/* check-mark badge */}
                {isSel && (
                  <span className="absolute top-1.5 right-1.5 bg-yellow-300 text-black
                                   rounded-full p-1 shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth={3}
                         className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}

                <figure className="relative overflow-hidden rounded-sm m-0">
                    <img
                      src={img.src}
                      alt={img.name}
                      className="block w-full h-36 sm:h-48 md:h-56 lg:h-64 object-cover"
                    />
                    <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-[10px] sm:text-[11px] md:text-[12px] lg:text-[13px] xl:text-[14px] font-bold py-1 px-1 uppercase tracking-wider leading-tight font-['Playfair_Display']">
                      {available ? img.name : "???"}
                    </figcaption>
                </figure>
              </div>
            );

          })}
        </div>
        </>
      )}

      {/* ───────────────── TAB 2 – CLUES / TOPICS ───────────────── */}
      {tab === "info" && (
        <div className="mt-4 flex flex-col gap-4 items-center bg-white/90 p-6 rounded-xl shadow-lg w-full max-w-3xl">
          {!videoStart ? (
            <p className="text-2xl italic text-gray-700">
              Waiting for the movie to start…
            </p>
          ) : visibleItems.length === 0 ? (
            <p className="text-xl italic text-gray-600">No clues for now.</p>
          ) : (
            <ul className="w-full space-y-3">
              {visibleItems.map((e, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[4rem_1fr] gap-4"
                >
                  <span className="font-mono text-lg text-right text-black">
                    {fmtMMSS(e.time)}
                  </span>

                  {e.kind === "clue" ? (
                    <span className="font-bold text-black text-lg">{e.text}</span>
                  ) : (
                    <span className="text-lg">
                      <span className="underline text-black">{e.title}</span>
                      {e.desc && (
                        <span className="text-gray-800"> — {e.desc}</span>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------- VISUALIZATION PAGE ------------------------------------------
function VisualizationPage() {
  const { charTimes }  = useScenarioData();
  const [results, setRes]  = useState([]);
  const [leader, setLead]  = useState([]);
  const [videoStart, setVS] = useState(0);
  const [sidebarW, setW]    = useState(Math.max(260, window.innerWidth * 0.1));
  const dragging            = useRef(false);
  const VIDEO_ID            = "a3XDry3EwiU";
  const minW                = 260;

  // clock for “has this character appeared yet?”
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!videoStart) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [videoStart]);

  const elapsedSec = videoStart ? (now - videoStart) / 1000 : 0;

  // fetch + subscribe to session start
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("video_session")
        .select("started_at")
        .eq("id", 1)
        .single();
      if (data?.started_at) setVS(Date.parse(data.started_at));
    })();

    const chan = supabase
      .channel("session")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "video_session", filter: "id=eq.1" },
        (payload) => {
          const ts = payload.new?.started_at;
          if (ts) setVS(Date.parse(ts));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(chan);
  }, []);

  const afterWindow = videoStart && Date.now() - videoStart >= WAIT_MS;

  // ---------------- poll votes (before window) ---------------
  useEffect(() => {
    if (afterWindow) return;
    const poll = async () => {
      const { data } = await supabase.from("votes").select("image_id");
      const m = new Map();
      data.forEach(({ image_id }) => m.set(image_id, (m.get(image_id) || 0) + 1));
      setRes([...m].map(([image_id, count]) => ({ image_id, count })));
    };
    poll();
    const id = setInterval(poll, 3_000);
    return () => clearInterval(id);
  }, [afterWindow]);

  // ---------------- poll scores (after window) ---------------
  useEffect(() => {
    if (!afterWindow) return;
    const fetchScores = async () => {
      const { data } = await supabase
        .from("scores")
        .select("user_name, score")
        .order("score", { ascending: false });
      setLead(data || []);
    };
    fetchScores();
    const id = setInterval(fetchScores, 3_000);
    return () => clearInterval(id);
  }, [afterWindow]);

  // derive top-3 suspects
  const { display, total } = useMemo(() => {
    const arr   = IMAGES.map((i) => ({
      ...i,
      count: results.find((r) => r.image_id === i.id)?.count || 0,
    }));
    const total = arr.reduce((a, b) => a + b.count, 0);
    if (!total) return { total, display: [] };
    const nz    = arr.filter((e) => e.count > 0).sort((a, b) => b.count - a.count);
    const top   = nz.length > 3 ? nz.slice(0, 3) : nz;
    return {
      total,
      display: top.map((o) => ({ ...o, pct: ((o.count / total) * 100).toFixed(1) })),
    };
  }, [results]);

  // ── Histogram data when the flag is ON ──────────────────────────────────
  const fullHist = useMemo(() => {
    // helper: split on first space → ['Researcher', 'Catnip']
    const wrap = (name) => {
      const i = name.indexOf(" ");
      return i === -1 ? name : [name.slice(0, i), name.slice(i + 1)];
    };

    const counts = IMAGES.map((i) =>
      results.find((r) => r.image_id === i.id)?.count || 0
    );
    const totalVotes = counts.reduce((a, b) => a + b, 0) || 1; // avoid /0
    const pct = counts.map((c) => ((c / totalVotes) * 100).toFixed(1));

    return {
      data: {
        //labels: IMAGES.map((i) => wrap(i.name)),
        labels: IMAGES.map((i) => {
          const appearAt =
            charTimes.has(normal(i.name)) ? charTimes.get(normal(i.name)) : Infinity;
          const shown = elapsedSec >= appearAt;
          return wrap(shown ? i.name : "???");
        }),
        datasets: [
          {
            label: "%",
            data: pct,
            backgroundColor: "rgba(54, 162, 235, 0.8)",
          },
        ],
      },
      opts: {
        indexAxis: "y",                          // horizontal bars
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%` },
          },
          y: {
              ticks: { font: { size: 16, weight: "bold" } }
          }
        },
      },
    };
  }, [results]);

  // drag sidebar
  useEffect(() => {
    const move = (e) => dragging.current && setW(Math.max(minW, window.innerWidth - e.clientX));
    const up   = () => (dragging.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // video start handler – resets everything, sets started_at
  const didReset = useRef(false);
  const onStart  = async () => {
    if (didReset.current) return;
    didReset.current = true;
    await resetAllAndNotify();
    const ts = new Date().toISOString();
    await supabase.from("video_session").upsert({ id: 1, started_at: ts });
    setVS(Date.parse(ts));
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden select-none">
      {/* video */}
      <div className="flex-grow h-full flex items-center justify-center bg-black">
        <div className="w-full aspect-video max-h-full">
          <ReactPlayer
            url={`https://www.youtube.com/watch?v=${VIDEO_ID}`}
            width="100%"
            height="100%"
            controls
            onStart={onStart}
            config={{ youtube: { playerVars: { cc_load_policy: 1 } } }}
            className="rounded-xl overflow-hidden"
          />
        </div>
      </div>

      {/* drag handle */}
      <div
        className="w-2 cursor-ew-resize bg-gray-300 hover:bg-gray-400"
        onPointerDown={() => (dragging.current = true)}
      />

      {/* sidebar */}
      <div
        className="bg-slate-800/90 backdrop-blur-sm p-2 flex flex-col items-center gap-4 overflow-hidden border-l border-slate-600"
        style={{ width: sidebarW }}
      >
        {!afterWindow ? (
          <>
            <p className="text-2xl font-extrabold text-center text-amber-100 font-['Playfair_Display'] tracking-wide">
              Who is the real killer? Vote at:
            </p>

            <div className="w-[95%]">
              <QRCode
                value="https://leo-cazenille.github.io/GUESS-THE-KILLER/"
                size={150}
                style={{ width: "100%", height: "auto" }}
              />
            </div>

            {SHOW_SIDEBAR_HISTOGRAM ? (
              <div className="w-full flex-1 flex flex-col">
                {/* extra spacing above the heading ↓ */}
                <p className="text-2xl font-bold text-center text-amber-100 mt-8 font-['Playfair_Display'] tracking-wide">
                  Live vote share
                </p>
                <div className="flex-1 overflow-y-auto">
                  {/* 400 px high canvas fits nicely in sidebar */}
                  <div style={{ minHeight: 800 }}>
                    <Bar
                      data={fullHist.data}
                      options={fullHist.opts}
                      height={400}
                    />
                  </div>
                </div>
                <p className="text-xl mt-2 text-center text-amber-200 font-['Crimson_Text']">{total} total votes</p>
              </div>
            ) : (
              <>   {/* ▼  ORIGINAL PORTRAIT LAYOUT restored */}
                <p className="text-2xl font-bold text-center text-amber-100 font-['Playfair_Display'] tracking-wide">
                  Top&nbsp;3 most voted:
                </p>

                {display.length === 0 ? (
                  <p className="text-2xl italic mt-2 text-amber-200 font-['Crimson_Text']">No votes yet</p>
                ) : (
                  <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto">
                    {display.map((it) => (
                      <div key={it.id} className="w-full flex flex-col items-center gap-1">
                        <div className={`victorian-frame color-${it.id} w-[60%] aspect-[2/3]`}>
                          <img
                            src={it.src}
                            alt={it.name}
                            className="w-full h-full object-cover object-top rounded-sm"
                          />
                          <span className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-[10px] sm:text-[11px] md:text-[12px] lg:text-[13px] xl:text-[14px] font-bold py-1 px-1 uppercase tracking-wider leading-tight font-['Playfair_Display']">
                            {it.name}
                          </span>
                        </div>
                        <p className="text-2xl font-extrabold text-amber-100 font-['Playfair_Display']">{it.pct}%</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xl text-center text-amber-200 mb-2 font-['Crimson_Text']">
                  {total} total votes
                </p>
              </>
            )}

          </>
        ) : (
          <>
            <p className="text-2xl font-extrabold text-center text-amber-100 font-['Playfair_Display'] tracking-wide">
              Leaderboard – who guessed the killer the longest?
            </p>
            {leader.length === 0 ? (
              <p className="text-xl italic text-amber-200 font-['Crimson_Text']">No scores yet</p>
            ) : (
              <ol className="flex-1 w-full overflow-y-auto flex flex-col gap-2">
                {leader.map((s, idx) => (
                  <li
                    key={s.user_name}
                    className="flex justify-between px-3 py-2 bg-slate-700/50 rounded-md text-amber-100 border border-slate-600"
                  >
                    <span className="font-bold text-xl font-['Crimson_Text']">
                      {idx + 1}. {s.user_name}
                    </span>
                    <span className="font-mono text-xl text-amber-200">
                      {s.score.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------- RESULTS PAGE -------------------------------------------
function ResultsPage() {
  const [logged, setLogged] = useState(() => sessionStorage.getItem("isAdmin") === "true");
  const [creds, setCreds]   = useState({ login: "", password: "" });
  const [counts, setCnt]    = useState(Array(IMAGES.length).fill(0));
  const [series, setSer]    = useState([]);
  const [videoStart, setVS] = useState(0);

  // listen for resets or session start
  useEffect(() => {
    const h = (e) => {
      if (e.key === "votes_reset") setSer([]);
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);

  // fetch + subscribe to session start
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("video_session")
        .select("started_at")
        .eq("id", 1)
        .single();
      if (data?.started_at) setVS(Date.parse(data.started_at));
    })();
    const chan = supabase
      .channel("session")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "video_session", filter: "id=eq.1" },
        (payload) => {
          const ts = payload.new?.started_at;
          if (ts) setVS(Date.parse(ts));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(chan);
  }, []);

  // poll votes
  useEffect(() => {
    if (!logged) return;

    const poll = async () => {
      const { data } = await supabase.from("votes").select("image_id");
      const arr = Array(IMAGES.length).fill(0);
      data.forEach(({ image_id }) => arr[image_id - 1]++);
      setCnt(arr);
      setSer((s) => [...s, { ts: Date.now(), arr }]);
    };

    const should = !videoStart || Date.now() - videoStart < WAIT_MS;
    if (!should) return;

    poll();
    const id = setInterval(poll, 3_000);

    let killer;
    if (videoStart) {
      const rem = videoStart + WAIT_MS - Date.now();
      killer = setTimeout(() => clearInterval(id), rem);
    }
    return () => {
      clearInterval(id);
      killer && clearTimeout(killer);
    };
  }, [logged, videoStart]);

  // Reset when the video is started
  useEffect(() => {
    let lastStart = 0;

    const poll = async () => {
      const { data } = await supabase
        .from("video_session")
        .select("started_at")
        .eq("id", 1)
        .maybeSingle();

      if (data?.started_at) {
        const ts = Date.parse(data.started_at);
        if (ts !== lastStart) {
          lastStart = ts;          // remember
          setVS(ts);               // (keeps existing logic)
          setSer([]);              // ← clears the line-plot
        }
      }
    };

    poll();                                   // first immediate fetch
    const id = setInterval(poll, 1_000);      // then every second
    return () => clearInterval(id);
  }, []);

  // admin reset
  const resetVotes = async () => {
    await resetAllAndNotify();
    setCnt(Array(IMAGES.length).fill(0));
    setSer([]);
    setVS(0);
  };

  // CSV helpers (same as before)
  const csv  = (rows) => rows.map((r) => r.join(",")).join("\n");
  const save = (t, n) => {
    const b = new Blob([t], { type: "text/csv" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u);
  };
  const exportHist   = () =>
    save(csv([["Character", "Votes"], ...IMAGES.map((img, i) => [img.name, counts[i]])]),
         "histogram.csv");
  const exportSeries = () =>
    save(csv([["timestamp", ...IMAGES.map((i) => i.name)],
              ...series.map((s) => [new Date(s.ts).toISOString(), ...s.arr])]),
         "time_series.csv");

  // login form
  if (!logged) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (creds.login === "admin" && creds.password === "tralala42") {
              setLogged(true);
              sessionStorage.setItem("isAdmin", "true");
            } else alert("Invalid credentials");
          }}
          className="bg-slate-800/90 backdrop-blur-sm p-6 rounded-md shadow-2xl border border-slate-600 flex flex-col gap-4 w-80"
        >
          <h1 className="text-3xl font-bold text-center font-['Playfair_Display'] tracking-wide text-amber-100">Admin</h1>
          <input
            className="border border-slate-600 p-2 bg-slate-700 text-amber-100 placeholder-amber-300/50 rounded"
            placeholder="Login"
            value={creds.login}
            onChange={(e) => setCreds({ ...creds, login: e.target.value })}
          />
          <input
            className="border border-slate-600 p-2 bg-slate-700 text-amber-100 placeholder-amber-300/50 rounded"
            type="password"
            placeholder="Password"
            value={creds.password}
            onChange={(e) => setCreds({ ...creds, password: e.target.value })}
          />
          <button className="bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-md text-xl transition-colors">Enter</button>
        </form>
      </div>
    );
  }

  // chart data --------------------------------------------------------------
  const total = counts.reduce((a, b) => a + b, 0);
  const perc  = total ? counts.map((c) => ((c / total) * 100).toFixed(2)) : counts;

  const barData = {
    labels: IMAGES.map((i) => i.name),
    datasets: [{ label: "%", data: perc, backgroundColor: "rgba(54,162,235,0.8)" }],
  };
  const tickFont = { size: 17 };   // bigger axis ticks
  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%`, font: tickFont } },
      x: { ticks: { font: tickFont } },
    },
  };

  const COLORS = [
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ec4899",
    "#14b8a6", "#d946ef", "#84cc16", "#dc2626", "#0ea5e9", "#a855f7",
  ];
  const lineData = {
    labels: series.map((s) => new Date(s.ts).toLocaleTimeString()),
    datasets: IMAGES.map((img, i) => ({
      label: img.name,
      data: series.map((s) => s.arr[i]),
      fill: false,
      tension: 0.3,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + "33",
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
    })),
  };
  const lineOpts = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { font: tickFont } },
      y: { ticks: { font: tickFont } },
    },
  };

  return (
    <div className="min-h-screen flex flex-col gap-8 p-6 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-4xl font-bold font-['Playfair_Display'] tracking-wide text-amber-100">Vote Results</h1>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportHist}   className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md transition-colors">
            Export histogram CSV
          </button>
          <button onClick={exportSeries} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md transition-colors">
            Export series CSV
          </button>
          <button onClick={resetVotes}   className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors">
            Reset votes
          </button>
        </div>
      </header>

      <p className="text-2xl font-['Crimson_Text'] text-amber-200">{total} total votes</p>

      {/* histogram */}
      <div className="w-full flex justify-center overflow-x-auto">
        <div
          className="w-full lg:w-4/5 bg-slate-800/90 backdrop-blur-sm p-4 rounded-md shadow-2xl border border-slate-600"
          style={{ minHeight: 800, minWidth: 1200 }}
        >
          <Bar data={barData} options={barOpts} height={800} width={1200} />
        </div>
      </div>

      {/* line plot */}
      <h2 className="text-3xl font-bold font-['Playfair_Display'] tracking-wide text-amber-100">Vote evolution over time</h2>
      <div
        className="w-full bg-slate-800/90 backdrop-blur-sm p-4 rounded-md shadow-2xl border border-slate-600"
        style={{ minHeight: 800, minWidth: 1200 }}
      >
        <Line data={lineData} options={lineOpts} height={800} width={1200} />
      </div>

      <div className="text-center mt-10">
        <Link to="/" className="text-amber-300 hover:text-amber-100 underline text-2xl font-['Crimson_Text'] transition-colors">
          Back to voting
        </Link>
      </div>
    </div>
  );
}

// ------------------------------------------- ROUTER ---------------------------------------------
export default function MainApp() {
  return (
    <Router>
      <Routes>
        <Route path="/"              element={<VoteGrid />} />
        <Route path="/visualization" element={<VisualizationPage />} />
        <Route path="/results"       element={<ResultsPage />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

