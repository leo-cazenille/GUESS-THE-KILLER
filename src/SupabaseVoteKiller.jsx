// Supabase Vote Demo – video-triggered reset, timed plots, selection percentage
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

// ---------- constants ------------------------------------------------------
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const VIDEO_ID = "a3XDry3EwiU";
const MAX_WINDOW_MS = 1200 * 1000; // 20 min
const MILESTONE_KEY = "videoStart";
const NAMES = [
  "D. Poiré","Jane Blond","D. Doubledork","The Director","Dr. Lafayette","Spiderman","Mew the ripper","Researcher Catnip","QTRobot","Pepper","Freaky Franka","Greta",
];
const IMAGES = NAMES.map((n,i)=>({id:i+1,name:n,src:`${import.meta.env.BASE_URL}photos/${i+1}.jpg`}));

/* -------------------------------------------------- Vote Grid -------------*/
function VoteGrid(){
  const [user,setUser]=useState(()=>localStorage.getItem("voter_name")||"");
  const [sel,setSel]=useState(null);
  const [pct,setPct]=useState(null);
  const accTime = useRef(0);
  const lastChange = useRef(null);
  const startTS=Number(localStorage.getItem(MILESTONE_KEY)||0);

  // prompt name
  useEffect(()=>{if(!user){const n=prompt("Enter your name to vote:")?.trim();if(n){setUser(n);localStorage.setItem("voter_name",n);}}},[user]);

  // load previous vote
  useEffect(()=>{if(!user) return;(async()=>{const {data}=await supabase.from("votes").select("image_id").eq("user_name",user).single();if(data) setSel(data.image_id);})();},[user]);

  // handle selection change + timer
  useEffect(()=>{
    if(startTS===0) return; // video not started yet
    const now=Date.now();
    if(sel===4){ lastChange.current = now; }
    const stopTS = startTS + MAX_WINDOW_MS;
    const interval=setInterval(()=>{
      const t=Date.now();
      if(t>=stopTS){
        if(sel===4 && lastChange.current) accTime.current += t - lastChange.current;
        clearInterval(interval);
        setPct(((accTime.current/MAX_WINDOW_MS)*100).toFixed(1));
      }
    },1000);
    return ()=>clearInterval(interval);
  },[sel,startTS]);

  const vote=async id=>{if(!user) return;
    const now=Date.now();
    // accumulate time on id 4
    if(sel===4 && lastChange.current){accTime.current += now - lastChange.current;}
    setSel(id);
    if(id===4) lastChange.current = now;
    await supabase.from("votes").upsert({user_name:user,image_id:id},{onConflict:"user_name"});
  };

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <h1 className="text-5xl font-bold text-center mb-6">Who do you think is the real killer?</h1>
      {pct!==null && <p className="text-3xl text-center text-green-600 mb-4">You selected character 4 for {pct}% of the 20‑minute window</p>}
      <div className="grid grid-cols-3 gap-4 md:gap-6">
        {IMAGES.map(img=>(
          <figure key={img.id} onClick={()=>vote(img.id)} className={`relative cursor-pointer rounded-lg overflow-hidden border-2 md:border-4 transition-shadow ${sel===img.id?"border-blue-500 shadow-lg":"border-transparent"}`}>
            <img src={img.src} alt={img.name} className="w-full h-44 md:h-56 lg:h-72 object-cover"/>
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-lg md:text-xl font-bold py-1 uppercase tracking-wider">{img.name}</figcaption>
          </figure>))}
      </div>
      <div className="flex flex-col items-center gap-4 mt-10 text-2xl">
        <Link className="underline text-blue-600" to="/visualization">Open live visualization</Link>
        <Link className="underline text-blue-600" to="/results">See full results</Link>
      </div>
    </div>);
}

/* ------------------------------------------------ Visualization ----------*/
function VisualizationPage(){
  const [sidebarW,setSidebarW]=useState(Math.max(260,window.innerWidth*0.1));
  const dragging=useRef(false);
  const [results,setResults]=useState([]);

  // poll votes
  useEffect(()=>{const poll=async()=>{const {data}=await supabase.from("votes").select("image_id");const map=new Map();data.forEach(({image_id})=>map.set(image_id,(map.get(image_id)||0)+1));setResults([...map].map(([image_id,count])=>({image_id,count})));};poll();const id=setInterval(poll,3000);return()=>clearInterval(id);},[]);

  // top‑3 logic
  const display=useMemo(()=>{const arr=IMAGES.map(i=>({...i,count:results.find(r=>r.image_id===i.id)?.count||0}));const total=arr.reduce((a,b)=>a+b.count,0);return arr.filter(a=>a.count>0).sort((a,b)=>b.count-a.count).slice(0,3).map(o=>({...o,pct:(total?((o.count/total)*100).toFixed(1):0)}));},[results]);

  // handle drag
  useEffect(()=>{const mv=e=>{if(!dragging.current) return;setSidebarW(Math.max(260,window.innerWidth-e.clientX));};const up=()=>dragging.current=false;window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);return()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);};},[]);

  // Reset on first play + store start time
  const onStart=async()=>{if(!localStorage.getItem(MILESTONE_KEY)){await supabase.from("votes").delete().gt("image_id",0);localStorage.setItem(MILESTONE_KEY,Date.now().toString());}}

  return(<div className="h-screen w-screen flex overflow-hidden select-none"><div className="flex-grow bg-black flex items-center justify-center"><div className="w-full aspect-video"><ReactPlayer url={`https://www.youtube.com/watch?v=${VIDEO_ID}`} width="100%" height="100%" controls onStart={onStart}/></div></div><div className="w-2 bg-gray-300 cursor-ew-resize" onPointerDown={()=>dragging.current=true}/><div className="bg-white p-2 flex flex-col items-center gap-4 overflow-hidden" style={{width:sidebarW}}><p className="text-xl font-bold text-center">Top suspects</p>{display.length?display.map((d,i)=>(<div key={i} className="text-center"><img src={d.src} className="w-24 h-32 object-cover rounded"/><p>{d.name}</p><p>{d.pct}%</p></div>)):<p>No votes</p>}<QRCode value="https://leo-cazenille.github.io/GUESS-THE-KILLER/" size={120}/></div></div>);
}

/* ------------------------------------------------ Results/Admin ----------*/
function ResultsPage(){
  const [logged,setLogged]=useState(()=>sessionStorage.getItem("isAdmin")==="true");
  const [creds,setCreds]=useState({login:"",password:""});
  const [counts,setCounts]=useState(Array(IMAGES.length).fill(0));
  const [series,setSeries]=useState([]);

  // polling with stop after 1200 s
  useEffect(()=>{if(!logged) return;const start=Number(localStorage.getItem(MILESTONE_KEY)||0);let id=null;const poll=async()=>{const now=Date.now();if(start && now-start>=MAX_WINDOW_MS){clearInterval(id);return;}const {data}=await supabase.from("votes").select("image_id");const arr=Array(IMAGES.length).fill(0);data.forEach(({image_id})=>arr[image_id-1]++);setCounts(arr);setSeries(s=>[...s.slice(-199),{ts:now,arr}]);};poll();id=setInterval(poll,3000);return()=>clearInterval(id);},[logged]);

  if(!logged){return(<div className="min-h-screen flex items-center justify-center bg-gray-100"><form onSubmit={e=>{e.preventDefault();if(creds.login==="admin"&&creds.password==="tralala42"){setLogged(true);sessionStorage.setItem("isAdmin","true");}else alert("Invalid");}} className="bg-white p-6 rounded shadow flex flex-col gap-3"><h1 className="text-2xl font-bold text-center">Admin</h1><input className="border p-2" placeholder="Login" value={creds.login} onChange={e=>setCreds({...creds,login:e.target.value})}/><input type="password" className="border p-2" placeholder="Password" value={creds.password} onChange={e=>setCreds({...creds,password:e.target.value})}/><button className="bg-blue-600 text-white py-2 rounded">Enter</button></form></div>);}  

  const total=counts.reduce((a,b)=>a+b,0);
  const perc=total?counts.map(c=>((c/total)*100).toFixed(2)):counts;
  const barData={labels:IMAGES.map(i=>i.name),datasets:[{label:"%",data:perc,backgroundColor:"rgba(54,162,235,0.8)"}]};
  const lineData={labels:series.map(s=>new Date(s.ts).toLocaleTimeString()),datasets:IMAGES.map((img,idx)=>({label:img.name,data:series.map(s=>s.arr[idx]),fill:false,tension:0.3}))};

  return(<div className="min-h-screen p-6 flex flex-col gap-8"><h1 className="text-4xl font-bold">Results</h1><p>{total} votes</p><div className="w-full lg:w-4/5 bg-white p-4 rounded shadow" style={{minHeight:800}}><Bar data={barData} options={{responsive:true,maintainAspectRatio:false}} height={800}/></div><div className="w-full bg-white p-4 rounded shadow" style={{minHeight:800}}><Line data={lineData} options={{responsive:true,maintainAspectRatio:false}} height={800}/></div><Link to="/" className="text-blue-600 underline text-2xl">Back</Link></div>);
}

export default function App(){return(<Router><Routes><Route path="/" element={<VoteGrid/>}/><Route path="/visualization" element={<VisualizationPage/>}/><Route path="/results" element={<ResultsPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Router>);}

