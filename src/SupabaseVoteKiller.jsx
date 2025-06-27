// SupabaseVoteKiller.jsx
// -------------------------------------------------------------------------------------------------
// Voting demo ‒ React + Vite + Supabase
//
// NEW (2025-06-27)
//   • VoteGrid no longer renders the final “correct” message.
//   • At the end of WAIT_SECONDS, VoteGrid stores the user’s score (% time on real killer)
//     in a Supabase table `scores` (schema: user_name text PK, pct numeric).
//   • VisualizationPage shows the live top-3 *until* WAIT_SECONDS has elapsed, then
//     switches to a leaderboard of all users and their scores.
// -------------------------------------------------------------------------------------------------

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

// --------------------------------------- CONFIG --------------------------------------------------
const ONE_SECOND   = 1_000;
const WAIT_SECONDS = 60;                      // 🔧 window for score (change once)
const WAIT_MS      = WAIT_SECONDS * ONE_SECOND;

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// suspects
const NAMES = [
  "D. Poiré",
  "Jane Blond",
  "D. Doubledork",
  "The Director",
  "Dr. Lafayette", // ID 5  ← real killer
  "Spiderman",
  "Mew the ripper",
  "Researcher Catnip",
  "QTRobot",
  "Pepper",
  "Freaky Franka",
  "Greta",
];
const asset  = (p) => `${import.meta.env.BASE_URL}${p}`;
const IMAGES = NAMES.map((name, i) => ({
  id:  i + 1,
  name,
  src: asset(`photos/${i + 1}.jpg`),
}));

const REAL_KILLER_ID   = 5;
const REAL_KILLER_NAME = NAMES[REAL_KILLER_ID - 1];

// -------------------------------- SHARED HELPERS -------------------------------------------------
async function resetVotesAndNotify() {
  await supabase.from("votes").delete().gt("image_id", 0);
  localStorage.setItem("votes_reset", Date.now().toString());
}

// -------------------------------------- VOTE GRID -----------------------------------------------
function VoteGrid() {
  const [user, setUser]     = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSel]  = useState(null);

  // timers
  const [videoStart, setVS] = useState(() => Number(localStorage.getItem("video_start") || 0));
  const killerMs            = useRef(0);
  const lastTick            = useRef(Date.now());
  const sentRef             = useRef(localStorage.getItem("score_sent") === "true");

  // ask for name
  useEffect(() => {
    if (!user) {
      const n = window.prompt("Enter your name to vote:")?.trim();
      if (n) {
        setUser(n);
        localStorage.setItem("voter_name", n);
      }
    }
  }, [user]);

  // fetch previous vote
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

  // handle vote
  const vote = async (id) => {
    if (!user) return;
    setSel(id);
    await supabase.from("votes").upsert(
      { user_name: user, image_id: id },
      { onConflict: "user_name" }
    );
  };

  // listen for new video start
  useEffect(() => {
    const h = (e) => e.key === "video_start" && setVS(Number(e.newValue));
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);

  // accumulate killer time
  useEffect(() => {
    if (!videoStart || sentRef.current) return;

    const stopAt = videoStart + WAIT_MS;

    const int = setInterval(async () => {
      const now = Date.now();

      // accumulate
      if (selected === REAL_KILLER_ID) {
        killerMs.current += now - lastTick.current;
      }
      lastTick.current = now;

      // finished?
      if (now >= stopAt) {
        if (selected === REAL_KILLER_ID) {
          killerMs.current += now - lastTick.current;
        }
        const pct = Math.min(100, (killerMs.current / WAIT_MS) * 100);

        // store score
        await supabase.from("scores").upsert(
          { user_name: user, pct },
          { onConflict: "user_name" }
        );
        localStorage.setItem("score_sent", "true");
        sentRef.current = true;
        clearInterval(int);
      }
    }, ONE_SECOND);

    return () => clearInterval(int);
  }, [selected, videoStart, user]);

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">
        Who do you think is the real killer?
        {user && (
          <span className="block text-lg font-medium mt-1">
            [username: {user}]
          </span>
        )}
      </h1>

      {/* voting grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            onClick={() => vote(img.id)}
            className={`relative rounded-lg overflow-hidden cursor-pointer border-2 md:border-4 transition-shadow ${
              selected === img.id
                ? "border-blue-500 shadow-lg"
                : "border-transparent"
            }`}
          >
            <img
              src={img.src}
              alt={img.name}
              className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover"
            />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-lg sm:text-xl font-bold py-1 uppercase tracking-wider">
              {img.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// --------------------------------- VISUALIZATION PAGE -------------------------------------------
function VisualizationPage() {
  const [results, setRes]       = useState([]);
  const [sidebarW, setW]        = useState(Math.max(260, window.innerWidth * 0.1));
  const dragging                = useRef(false);
  const VIDEO_ID                = "a3XDry3EwiU";
  const minW                    = 260;

  const [videoStart, setVS]     = useState(() => Number(localStorage.getItem("video_start") || 0));
  const [leaderboard, setLB]    = useState([]);

  // track video start from other tabs
  useEffect(() => {
    const h = (e) => e.key === "video_start" && setVS(Number(e.newValue));
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);

  const now           = Date.now();
  const showLeaderboard = videoStart && now - videoStart >= WAIT_MS;

  // Poll votes (only while leaderboard not yet active)
  useEffect(() => {
    if (showLeaderboard) return;

    const poll = async () => {
      const { data } = await supabase.from("votes").select("image_id");
      const m = new Map();
      data.forEach(({ image_id }) => m.set(image_id, (m.get(image_id) || 0) + 1));
      setRes([...m].map(([image_id, count]) => ({ image_id, count })));
    };
    poll();
    const id = setInterval(poll, 3_000);
    return () => clearInterval(id);
  }, [showLeaderboard]);

  // Poll leaderboard once the window is over
  useEffect(() => {
    if (!showLeaderboard) return;

    const poll = async () => {
      const { data } = await supabase.from("scores").select("*");
      setLB(
        data
          .map((d) => ({ ...d, pct: Number(d.pct) }))
          .sort((a, b) => b.pct - a.pct)
      );
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [showLeaderboard]);

  // Derive top-3 *
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

  // video start handler (resets votes & timer)
  const didReset = useRef(false);
  const onStart  = async () => {
    if (didReset.current) return;
    didReset.current = true;
    await resetVotesAndNotify();
    localStorage.setItem("video_start", Date.now().toString());
    localStorage.removeItem("score_sent");     // allow users to post again next round
  };

  // ------------------------------- UI -----------------------------------------------------------
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
        className="bg-white p-2 flex flex-col items-center gap-4 overflow-hidden"
        style={{ width: sidebarW }}
      >
        <p className="text-2xl font-extrabold text-center text-black">
          {showLeaderboard
            ? "Leaderboard:"
            : "Who is the real killer? Vote at:"}
        </p>

        {!showLeaderboard && (
          <div className="w-[95%]">
            <QRCode
              value="https://leo-cazenille.github.io/GUESS-THE-KILLER/"
              size={150}
              style={{ width: "100%", height: "auto" }}
            />
          </div>
        )}

        {/* Top-3 or Leaderboard */}
        {showLeaderboard ? (
          <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto">
            {leaderboard.length === 0 ? (
              <p className="text-xl text-black mt-4">Scores pending…</p>
            ) : (
              leaderboard.map((u, idx) => (
                <p key={u.user_name} className="text-2xl font-bold text-black">
                  {idx + 1}. {u.user_name}: {u.pct.toFixed(1)}%
                </p>
              ))
            )}
          </div>
        ) : display.length === 0 ? (
          <p className="text-2xl italic mt-2 text-black">No votes yet</p>
        ) : (
          <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto">
            {display.map((it) => (
              <div key={it.id} className="w-full flex flex-col items-center gap-1">
                <div className="relative w-[60%] aspect-[2/3]">
                  <img
                    src={it.src}
                    alt={it.name}
                    className="w-full h-full object-cover rounded-md border"
                  />
                  <span className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-lg font-extrabold py-1 uppercase tracking-wider">
                    {it.name}
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-black">{it.pct}%</p>
              </div>
            ))}
          </div>
        )}

        {!showLeaderboard && (
          <p className="text-xl text-center text-black mb-2">{total} total votes</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------ RESULTS ----------------------------------------------
/*  (unchanged since the previous revision ‒ still larger tick labels, all series kept)  */

function ResultsPage() {
  const [logged, setLogged] = useState(() => sessionStorage.getItem("isAdmin") === "true");
  const [creds,  setCreds]  = useState({ login: "", password: "" });
  const [counts, setCnt]    = useState(Array(IMAGES.length).fill(0));
  const [series, setSer]    = useState([]);
  const [videoStart, setVS] = useState(() => Number(localStorage.getItem("video_start") || 0));

  useEffect(() => {
    const h = (e) => {
      if (e.key === "votes_reset")  setSer([]);
      if (e.key === "video_start") setVS(Number(e.newValue));
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);

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

  const resetVotes = async () => {
    await resetVotesAndNotify();
    setCnt(Array(IMAGES.length).fill(0));
    setSer([]);
  };

  const csv  = (rows) => rows.map((r) => r.join(",")).join("\n");
  const save = (t, n) => {
    const b = new Blob([t], { type: "text/csv" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u);
  };
  const exportHist   = () =>
    save(
      csv([["Character", "Votes"], ...IMAGES.map((img, i) => [img.name, counts[i]])]),
      "histogram.csv"
    );
  const exportSeries = () =>
    save(
      csv([
        ["timestamp", ...IMAGES.map((i) => i.name)],
        ...series.map((s) => [new Date(s.ts).toISOString(), ...s.arr]),
      ]),
      "time_series.csv"
    );

  if (!logged) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (creds.login === "admin" && creds.password === "tralala42") {
              setLogged(true);
              sessionStorage.setItem("isAdmin", "true");
            } else alert("Invalid");
          }}
          className="bg-white p-6 rounded-md shadow-md flex flex-col gap-4 w-80"
        >
          <h1 className="text-3xl font-bold text-center">Admin</h1>
          <input
            className="border p-2"
            placeholder="Login"
            value={creds.login}
            onChange={(e) => setCreds({ ...creds, login: e.target.value })}
          />
          <input
            className="border p-2"
            type="password"
            placeholder="Password"
            value={creds.password}
            onChange={(e) => setCreds({ ...creds, password: e.target.value })}
          />
          <button className="bg-blue-600 text-white py-2 rounded-md text-xl">Enter</button>
        </form>
      </div>
    );
  }

  // chart data & options (same as previous revision)
  const total = counts.reduce((a, b) => a + b, 0);
  const perc  = total ? counts.map((c) => ((c / total) * 100).toFixed(2)) : counts;

  const barData = {
    labels: IMAGES.map((i) => i.name),
    datasets: [{ label: "%", data: perc, backgroundColor: "rgba(54,162,235,0.8)" }],
  };
  const tickFont = { size: 17 };
  const barOpts  = {
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
    scales: { x: { ticks: { font: tickFont } }, y: { ticks: { font: tickFont } } },
  };

  return (
    <div className="min-h-screen flex flex-col gap-8 p-6">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-4xl font-bold">Vote Results</h1>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportHist}   className="bg-green-600 text-white px-4 py-2 rounded-md">
            Export histogram CSV
          </button>
          <button onClick={exportSeries} className="bg-green-600 text-white px-4 py-2 rounded-md">
            Export series CSV
          </button>
          <button onClick={resetVotes}   className="bg-red-600   text-white px-4 py-2 rounded-md">
            Reset votes
          </button>
        </div>
      </header>

      <p className="text-2xl">{total} total votes</p>

      <div className="w-full flex justify-center overflow-x-auto">
        <div
          className="w-full lg:w-4/5 bg-white p-4 rounded-md shadow-md"
          style={{ minHeight: 800, minWidth: 1200 }}
        >
          <Bar data={barData} options={barOpts} height={800} width={1200} />
        </div>
      </div>

      <h2 className="text-3xl font-bold">Vote evolution over time</h2>
      <div
        className="w-full bg-white p-4 rounded-md shadow-md"
        style={{ minHeight: 800, minWidth: 1200 }}
      >
        <Line data={lineData} options={lineOpts} height={800} width={1200} />
      </div>

      <div className="text-center mt-10">
        <Link to="/" className="text-blue-600 underline text-2xl">
          Back to voting
        </Link>
      </div>
    </div>
  );
}

// ------------------------------------------ ROUTER ----------------------------------------------
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

