// App.jsx – add /visualization (renamed) + new /results histogram page
// -------------------------------------------------------------------------------------------------
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { HashRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import ReactPlayer from "react-player/youtube";
import { QRCodeCanvas as QRCode } from "qrcode.react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ---------- Supabase & static data ----------------------------------------
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const NAMES = [
  "D. Poiré", "Jane Blond", "D. Doubledork", "The Director", "Dr. Lafayette", "Spiderman", "Mew the ripper", "Researcher Catnip", "QTRobot", "Pepper", "Freaky Franka", "Greta",
];
const asset = (p) => `${import.meta.env.BASE_URL}${p}`;
const IMAGES = NAMES.map((name, i) => ({ id: i + 1, name, src: asset(`photos/${i + 1}.jpg`) }));

// ---------- VoteGrid -------------------------------------------------------
function VoteGrid() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (!user) { const n = window.prompt("Enter your name to vote:")?.trim(); if (n) { setUser(n); localStorage.setItem("voter_name", n); } } }, [user]);
  useEffect(() => { if (!user) return; (async () => { const { data } = await supabase.from("votes").select("image_id").eq("user_name", user).single(); if (data) setSelected(data.image_id); })(); }, [user]);
  const vote = async (id) => { if (!user) return; setSelected(id); await supabase.from("votes").upsert({ user_name: user, image_id: id }, { onConflict: "user_name" }); };
  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-6xl font-bold mb-8 text-center">Who do you think is the real killer?</h1>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map(img => (
          <figure key={img.id} onClick={() => vote(img.id)} className={`relative rounded-lg overflow-hidden cursor-pointer border-2 md:border-4 transition-shadow ${selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"}`}>
            <img src={img.src} alt={img.name} className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover" />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xl sm:text-2xl font-bold py-1 uppercase tracking-wider">{img.name}</figcaption>
          </figure>))}
      </div>
      <div className="text-center mt-8 flex flex-col gap-4">
        <Link to="/visualization" className="text-blue-600 underline text-2xl">Open live visualization</Link>
        <Link to="/results" className="text-blue-600 underline text-2xl">See full histogram</Link>
      </div>
    </div>);
}

// ---------- VisualizationPage (formerly ResultsPage) ----------------------
function VisualizationPage() {
  const [results, setResults] = useState([]);
  const [sidebarW, setSidebarW] = useState(Math.max(260, window.innerWidth * 0.10));
  const dragging = useRef(false);
  const minW = 260;
  const VIDEO_ID = "a3XDry3EwiU";
  useEffect(() => { const poll = async () => { const { data } = await supabase.from("votes").select("image_id"); const map = new Map(); data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1)); setResults([...map].map(([image_id, count]) => ({ image_id, count }))); }; poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, []);
  const { display, total } = useMemo(() => {
    const arr = IMAGES.map(i => ({ ...i, count: results.find(r => r.image_id === i.id)?.count || 0 }));
    const total = arr.reduce((a, b) => a + b.count, 0);
    if (total === 0) return { total, display: [] };
    const nonZero = arr.filter(e => e.count > 0).sort((a, b) => b.count - a.count);
    const top = nonZero.length > 3 ? nonZero.slice(0, 3) : nonZero;
    return { total, display: top.map(o => ({ ...o, pct: ((o.count / total) * 100).toFixed(1) })) };
  }, [results]);
  useEffect(() => {
    const move = (e) => { if (!dragging.current) return; setSidebarW(Math.max(minW, window.innerWidth - e.clientX)); };
    const up = () => { dragging.current = false; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  return (
    <div className="h-screen w-screen flex overflow-hidden select-none">
      <div className="flex-grow h-full flex items-center justify-center bg-black">
        <div className="w-full aspect-video max-h-full"><ReactPlayer url={`https://www.youtube.com/watch?v=${VIDEO_ID}`} width="100%" height="100%" controls config={{ youtube: { playerVars: { cc_load_policy: 1 } } }} className="rounded-xl overflow-hidden" /></div>
      </div>
      <div className="w-2 cursor-ew-resize bg-gray-300 hover:bg-gray-400" onPointerDown={() => { dragging.current = true; }} />
      <div className="bg-white p-2 flex flex-col items-center gap-4 overflow-hidden" style={{ width: sidebarW }}>
        <p className="text-2xl font-extrabold text-center text-black">Who is the real killer? Vote at:</p>
        <div className="w-[95%]"><QRCode value="https://leo-cazenille.github.io/GUESS-THE-KILLER/" size={150} style={{ width: "100%", height: "auto" }} /></div>
        <p className="text-2xl font-bold text-center text-black">Top 3 most voted:</p>
        {display.length === 0 ? <p className="text-2xl italic text-black mt-2">No votes yet</p> : (
          <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto">
            {display.map((itm, idx) => (
              <div key={idx} className="w-full flex flex-col items-center gap-1">
                <div className="relative w-[60%] aspect-[2/3]">
                  <img src={itm.src} alt={itm.name} className="w-full h-full object-cover rounded-md border" />
                  <span className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xl font-extrabold py-1 uppercase tracking-wider">{itm.name}</span>
                </div>
                <p className="text-2xl font-extrabold text-black">{itm.pct}%</p>
              </div>))}
          </div>)}
        <p className="text-xl text-center text-black mb-2">{total} total votes</p>
      </div>
    </div>);
}

// ---------- Histogram ResultsPage ----------------------------------------
function HistogramPage() {
  const [results, setResults] = useState([]);
  useEffect(() => { const poll = async () => { const { data } = await supabase.from("votes").select("image_id"); const map = new Map(); data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1)); setResults([...map].map(([image_id, count]) => ({ image_id, count }))); }; poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, []);

  // thumbnail plugin for x-axis
  const thumbs = IMAGES.map(i => { const im = new Image(); im.src = i.src; return im; });
  const thumbPlugin = {
    id: "xThumbs",
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart; const size = 100; const y = chartArea.bottom + 20;
      scales.x.ticks.forEach((_, idx) => { const x = scales.x.getPixelForTick(idx); const img = thumbs[idx]; if (!img.complete) img.onload = () => chart.draw(); ctx.save(); ctx.beginPath(); ctx.rect(x - size / 2, y, size, size); ctx.clip(); ctx.drawImage(img, x - size / 2, y, size, size); ctx.restore(); });
    },
  };
  ChartJS.register(thumbPlugin);

  const { chartData, chartOpts, total } = useMemo(() => { const counts = IMAGES.map((img) => results.find(r => r.image_id === img.id)?.count || 0); const total = counts.reduce((a, b) => a + b, 0); const perc = total ? counts.map(c => ((c / total) * 100).toFixed(2)) : counts; const wrap = s => { const idx = s.indexOf(" "); return idx > 0 ? [s.slice(0, idx), s.slice(idx + 1)] : [s]; };
    return {
      total,
      chartData: { labels: IMAGES.map(i => wrap(i.name)), datasets: [{ label: "% of votes", data: perc, backgroundColor: "rgba(54,162,235,0.8)", barPercentage: 0.98, categoryPercentage: 0.98 }] },
      chartOpts: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { bottom: 140 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}%` } }, xThumbs: {} },
        scales: { x: { ticks: { maxRotation: 0, autoSkip: false, font: { size: 20 } } }, y: { beginAtZero: true, max: 100, ticks: { callback: val => `${val}%`, font: { size: 18 } } } },
      },
    }; }, [results]);

  return (
    <div className="min-h-screen flex flex-col p-4">
      <h1 className="text-4xl font-bold text-center mb-4">Vote Distribution</h1>
      <p className="text-xl text-center mb-4">{total} total votes</p>
      <div className="flex-1"><Bar data={chartData} options={chartOpts} /></div>
      <div className="text-center mt-4"><Link to="/" className="text-blue-600 underline text-xl">Back to voting</Link></div>
    </div>);
}

// ---------- Router --------------------------------------------------------
export default function MainApp() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VoteGrid />} />
        <Route path="/visualization" element={<VisualizationPage />} />
        <Route path="/results" element={<HistogramPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

