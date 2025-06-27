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

// ---------- Admin results page --------------------------------------
function ResultsPage(){
  const [logged,setLogged]=useState(()=>sessionStorage.getItem("isAdmin")==="true");
  const [creds,setCreds]=useState({login:"",password:""});
  const [counts,setCounts]=useState(Array(IMAGES.length).fill(0));
  const [series,setSeries]=useState([]);

  // polling votes
  useEffect(()=>{if(!logged) return; const poll=async()=>{const {data}=await supabase.from("votes").select("image_id");const arr=Array(IMAGES.length).fill(0);data.forEach(({image_id})=>arr[image_id-1]++);setCounts(arr);setSeries(s=>[...s.slice(-199),{ts:Date.now(),arr}]);}; poll(); const id=setInterval(poll,3000); return()=>clearInterval(id);},[logged]);

  const resetVotes=async()=>{await supabase.from("votes").delete().gt("image_id",0);setCounts(Array(IMAGES.length).fill(0));setSeries([]);};

  // csv helpers
  const csv=(rows)=>rows.map(r=>r.join(",")).join("\n");
  const dl=(text,name)=>{const blob=new Blob([text],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
  const exportHist=()=>dl(csv([["Character","Votes"],...IMAGES.map((img,i)=>[img.name,counts[i]])]),"histogram.csv");
  const exportSeries=()=>dl(csv([["timestamp",...IMAGES.map(i=>i.name)],...series.map(s=>[new Date(s.ts).toISOString(),...s.arr])]),"time_series.csv");

  if(!logged){return(<div className="min-h-screen flex items-center justify-center bg-gray-100 p-6"><form onSubmit={e=>{e.preventDefault();if(creds.login==="admin"&&creds.password==="tralala42"){setLogged(true);sessionStorage.setItem("isAdmin","true");}else alert("Invalid");}} className="bg-white p-6 rounded-md shadow-md flex flex-col gap-4 w-80"><h1 className="text-3xl font-bold text-center">Admin</h1><input className="border p-2" placeholder="Login" value={creds.login} onChange={e=>setCreds({...creds,login:e.target.value})}/><input className="border p-2" type="password" placeholder="Password" value={creds.password} onChange={e=>setCreds({...creds,password:e.target.value})}/><button className="bg-blue-600 text-white py-2 rounded-md text-xl">Enter</button></form></div>);}

  const total=counts.reduce((a,b)=>a+b,0);
  const perc=total?counts.map(c=>((c/total)*100).toFixed(2)):counts;

  const barData={labels:IMAGES.map(i=>i.name),datasets:[{label:"%",data:perc,backgroundColor:"rgba(54,162,235,0.8)"}]};
  const barOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>`${v}%`}}}};

  // Put a palette somewhere near your other constants
  const COLORS = [
      "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
      "#6366f1", "#ec4899", "#14b8a6", "#d946ef",
      "#84cc16", "#dc2626", "#0ea5e9", "#a855f7"
  ];

  //const lineData={labels:series.map(s=>new Date(s.ts).toLocaleTimeString()),datasets:IMAGES.map((img,idx)=>({label:img.name,data:series.map(s=>s.arr[idx]),fill:false,tension:0.3}))};
    // Re-build the datasets with per-character colours
    const lineData = {
      labels: series.map(s => new Date(s.ts).toLocaleTimeString()),
      datasets: IMAGES.map((img, idx) => ({
        label: img.name,
        data:  series.map(s => s.arr[idx]),
        fill:  false,
        tension: 0.3,
        borderColor: COLORS[idx % COLORS.length],
        backgroundColor: COLORS[idx % COLORS.length] + "33",   // 20 % alpha for points
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
      }))
    };

  return(
    <div className="min-h-screen flex flex-col gap-8 p-6">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-4xl font-bold">Vote Results</h1>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportHist} className="bg-green-600 text-white px-4 py-2 rounded-md text-lg">Export histogram CSV</button>
          <button onClick={exportSeries} className="bg-green-600 text-white px-4 py-2 rounded-md text-lg">Export series CSV</button>
          <button onClick={resetVotes} className="bg-red-600 text-white px-4 py-2 rounded-md text-lg">Reset votes</button>
        </div>
      </header>

      <p className="text-2xl">{total} total votes</p>

      <div className="w-full flex justify-center overflow-x-auto"><div className="w-full lg:w-4/5 bg-white p-4 rounded-md shadow-md" style={{minHeight:800, minWidth:1200}}><Bar data={barData} options={barOpts} height={800} width={1200}/></div></div>

      <h2 className="text-3xl font-bold">Vote evolution over time</h2>
      <div className="w-full bg-white p-4 rounded-md shadow-md" style={{minHeight:800, minWidth:1200}}><Line data={lineData} options={{responsive:true,maintainAspectRatio:false}} height={800} width={1200}/></div>

      <div className="text-center mt-10"><Link className="text-blue-600 underline text-2xl" to="/">Back to voting</Link></div>
    </div>);
}



// ---------- Router --------------------------------------------------------
export default function MainApp() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VoteGrid />} />
        <Route path="/visualization" element={<VisualizationPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

