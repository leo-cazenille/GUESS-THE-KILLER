// App.jsx – larger fonts ×3 and new video ID a3XDry3EwiU
// -------------------------------------------------------------------------------------------------
import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { HashRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import ReactPlayer from "react-player/youtube";
import { QRCodeCanvas as QRCode } from "qrcode.react";

// Supabase & static data ----------------------------------------------------
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const NAMES = [
  "D. Poiré", "Jane Blond", "D. Doubledork", "The Director", "Dr. Lafayette", "Spiderman", "Mew the ripper", "Researcher Catnip", "QTRobot", "Pepper", "Freaky Franka", "Greta",
];
const asset = (p) => `${import.meta.env.BASE_URL}${p}`;
const IMAGES = NAMES.map((name, i) => ({ id: i + 1, name, src: asset(`photos/${i + 1}.jpg`) }));

// ------------------- Vote Grid -------------------------------------------
function VoteGrid() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!user) {
      const n = window.prompt("Enter your name to vote:")?.trim();
      if (n) { setUser(n); localStorage.setItem("voter_name", n); }
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("votes").select("image_id").eq("user_name", user).single();
      if (data) setSelected(data.image_id);
    })();
  }, [user]);

  const vote = async (id) => {
    if (!user) return;
    setSelected(id);
    await supabase.from("votes").upsert({ user_name: user, image_id: id }, { onConflict: "user_name" });
  };

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-6xl font-bold mb-8 text-center">Who do you think is the real killer?</h1>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map(img => (
          <figure key={img.id} onClick={() => vote(img.id)} className={`relative cursor-pointer rounded-lg overflow-hidden border-2 md:border-4 transition-shadow ${selected===img.id?"border-blue-500 shadow-lg":"border-transparent"}`}>
            <img src={img.src} alt={img.name} className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover" />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xl sm:text-2xl font-bold py-1 uppercase tracking-wider">{img.name}</figcaption>
          </figure>
        ))}
      </div>
      <div className="text-center mt-8"><Link to="/results" className="text-blue-600 underline text-2xl">See live results</Link></div>
    </div>
  );
}

// ------------------- Results Page ----------------------------------------
function ResultsPage() {
  const [results, setResults] = useState([]);
  const VIDEO_ID = "a3XDry3EwiU"; // new video

  useEffect(() => {
    const poll = async () => {
      const { data } = await supabase.from("votes").select("image_id");
      const map = new Map();
      data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1));
      setResults([...map].map(([image_id, count]) => ({ image_id, count })));
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const { display, total } = useMemo(() => {
    const enriched = IMAGES.map(i => ({ ...i, count: results.find(r => r.image_id === i.id)?.count || 0 }));
    const total = enriched.reduce((a, b) => a + b.count, 0);
    if (total === 0) return { total, display: [] };
    const nonZero = enriched.filter(e => e.count > 0).sort((a, b) => b.count - a.count);
    const top = nonZero.length > 3 ? nonZero.slice(0, 3) : nonZero;
    return { total, display: top.map(o => ({ ...o, pct: ((o.count / total) * 100).toFixed(1) })) };
  }, [results]);

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Video */}
      <div className="flex-none w-[90vw] h-full flex items-center justify-center bg-black">
        <div className="w-full aspect-video max-h-full">
          <ReactPlayer url={`https://www.youtube.com/watch?v=${VIDEO_ID}`} width="100%" height="100%" controls config={{ youtube: { playerVars: { cc_load_policy: 1 } } }} className="rounded-xl overflow-hidden" />
        </div>
      </div>

      {/* Right column */}
      <div className="flex-none w-[10vw] min-w-[180px] bg-white p-2 flex flex-col items-center gap-4 overflow-hidden">
        {/* QR section */}
        <p className="text-2xl font-extrabold text-center leading-snug text-black">Who do you think is the real killer? Vote at:</p>
        <div className="w-[95%]"><QRCode value="https://leo-cazenille.github.io/GUESS-THE-KILLER/" size={150} style={{ width: "100%", height: "auto" }} /></div>

        {/* Top‑3 heading */}
        <p className="text-2xl font-bold text-center px-1 leading-tight text-black">Top 3 characters with the most votes</p>

        {/* Top list or message */}
        {display.length === 0 ? (
          <p className="text-2xl italic text-black mt-4">No votes yet</p>
        ) : (
          <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto">
            {display.map((itm, idx) => (
              <div key={idx} className="w-full flex flex-col items-center gap-1">
                <div className="relative w-[90%] aspect-[2/3]">
                  <img src={itm.src} alt={itm.name} className="w-full h-full object-cover rounded-md border" />
                  <span className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xl font-extrabold py-1 uppercase tracking-wider">{itm.name}</span>
                </div>
                <p className="text-2xl font-bold text-black">{itm.pct}%</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xl text-center mb-1 text-black">{total} total votes</p>
      </div>
    </div>
  );
}

// ------------------- Router ----------------------------------------------
export default function MainApp() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VoteGrid />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

