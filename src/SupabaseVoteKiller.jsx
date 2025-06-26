// App.jsx – vertical bars, visible logos & ticks, full‑width QR code
// -------------------------------------------------------------------------------------------------
import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { HashRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import ReactPlayer from "react-player/youtube";
import { QRCodeCanvas as QRCode } from "qrcode.react";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// -------------------------------- data & supabase -------------------------
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const NAMES = [
  "D. Poiré", "Jane Blond", "D. Doubledork", "The Director", "Dr. Lafayette", "Spiderman", "Mew the ripper", "Researcher Catnip", "QTRobot", "Pepper", "Freaky Franka", "Greta",
];
const asset = (p) => `${import.meta.env.BASE_URL}${p}`;
const IMAGES = NAMES.map((name, i) => ({ id: i + 1, name, src: asset(`photos/${i + 1}.jpg`) }));

// -------------- thumbnail plugin (under x‑axis) ---------------------------
const thumbs = IMAGES.map(i => { const im = new Image(); im.src = i.src; return im; });
const thumbPlugin = {
  id: "xThumbs",
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const size = 50;
    const y = chartArea.bottom + 6;
    scales.x.ticks.forEach((_, idx) => {
      const x = scales.x.getPixelForTick(idx);
      const img = thumbs[idx];
      if (!img.complete) img.onload = () => chart.draw();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - size / 2, y, size, size);
      ctx.clip();
      ctx.drawImage(img, x - size / 2, y, size, size);
      ctx.restore();
    });
  },
};
ChartJS.register(thumbPlugin);

// -------------------------------- VoteGrid -------------------------------
function VoteGrid() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (!user) { const n = window.prompt("Enter your name to vote:"); if (n?.trim()) { setUser(n.trim()); localStorage.setItem("voter_name", n.trim()); } } }, [user]);
  useEffect(() => { if (!user) return; (async () => { const { data } = await supabase.from("votes").select("image_id").eq("user_name", user).single(); if (data) setSelected(data.image_id); })(); }, [user]);

  const vote = async (id) => { if (!user) return; setSelected(id); await supabase.from("votes").upsert({ user_name: user, image_id: id }, { onConflict: "user_name" }); };

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-center">Who do you think is the real killer?</h1>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map(img => (
          <figure key={img.id} onClick={() => vote(img.id)} className={`relative cursor-pointer rounded-lg overflow-hidden border-2 md:border-4 transition-shadow ${selected===img.id?"border-blue-500 shadow-lg":"border-transparent"}`}>
            <img src={img.src} alt={img.name} className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover" />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xs sm:text-sm md:text-base font-bold py-0.5 sm:py-1 md:py-2 uppercase tracking-wider">{img.name}</figcaption>
          </figure>
        ))}
      </div>
      <div className="text-center mt-8"><Link to="/results" className="text-blue-600 underline">See live results</Link></div>
    </div>
  );
}

// -------------------------------- ResultsPage ----------------------------
function ResultsPage() {
  const [results, setResults] = useState(null);
  const load = async () => { const { data } = await supabase.from("votes").select("image_id"); const map=new Map(); data.forEach(({image_id})=>map.set(image_id,(map.get(image_id)||0)+1)); setResults([...map].map(([image_id,count])=>({image_id,count}))); };
  useEffect(()=>{load();const id=setInterval(load,3000);return()=>clearInterval(id);},[]);

  const { chartData, chartOpts, total } = useMemo(()=>{
    const counts = IMAGES.map(i=>results?.find(r=>r.image_id===i.id)?.count||0);
    const total = counts.reduce((a,b)=>a+b,0);
    const perc = total?counts.map(c=>(c/total*100).toFixed(2)):counts;
    return {
      total,
      chartData:{ labels:IMAGES.map(i=>i.name), datasets:[{ data:perc, backgroundColor:"rgba(54,162,235,0.8)", barPercentage:0.9, categoryPercentage:0.9 }]},
      chartOpts:{ responsive:true, maintainAspectRatio:false, scales:{ x:{ beginAtZero:true, max:100, ticks:{callback:v=>v+"%"} }, y:{ ticks:{ font:{size:11}, color:"#000", autoSkip:false } } }, plugins:{ legend:{display:false}, xThumbs:{} } },
    };
  },[results]);

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Video 90% */}
      <div className="flex-none w-[90vw] h-full flex items-center justify-center bg-black">
        <div className="w-full aspect-video max-h-full">
          <ReactPlayer url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width="100%" height="100%" controls config={{ youtube:{ playerVars:{ cc_load_policy:1 } } }} className="rounded-xl overflow-hidden" />
        </div>
      </div>

      {/* Right 10% column */}
      <div className="flex-none w-[10vw] min-w-[160px] bg-white p-1 flex flex-col items-center relative">
        <h2 className="text-xs font-semibold text-center mb-1">Results<br/>[{total} samples]</h2>
        <div className="flex-1 w-full"><Bar data={chartData} options={chartOpts} /></div>
        <div className="w-[90%] mx-auto mb-1"><QRCode value="https://leo-cazenille.github.io/GUESS-THE-KILLER/" size={128} style={{ width:"100%", height:"auto" }} /></div>
      </div>
    </div>
  );
}

// -------------------------------- Router ---------------------------------
export default function MainApp(){return(<Router><Routes><Route path="/" element={<VoteGrid/>}/><Route path="/results" element={<ResultsPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Router>);}

