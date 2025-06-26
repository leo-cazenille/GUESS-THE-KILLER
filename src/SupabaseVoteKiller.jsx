// App.jsx – complete two‑page app (VoteGrid + ResultsPage) with YouTube subtitles
//------------------------------------------------------------------------------------------------------------------
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
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
} from "react-router-dom";
import { QRCodeCanvas as QRCode } from "qrcode.react";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ---- Supabase -------------------------------------------------------------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---- Data -----------------------------------------------------------------
const NAMES = [
  "D. Poiré",
  "Jane Blond",
  "D. Doubledork",
  "The Director",
  "Dr. Lafayette",
  "Spiderman",
  "Mew the ripper",
  "Researcher Catnip",
  "QTRobot",
  "Pepper",
  "Freaky Franka",
  "Greta",
];
const IMAGES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: NAMES[i],
  src: `photos/${i + 1}.jpg`,
}));

// ---- Utility: fetch YouTube transcript (public captions) ------------------
async function fetchYoutubeTranscript(id, lang = "en") {
  try {
    const res = await fetch(
      `https://youtubetranscript.com/?format=json&video_id=${id}&lang=${lang}`
    );
    if (!res.ok) throw new Error("No transcript or CORS blocked");
    return await res.json(); // array of {text,start,duration}
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ---- Shared vote hook -----------------------------------------------------
function useVotes() {
  const [results, setResults] = useState(null);
  const fetchResults = async () => {
    const { data } = await supabase.from("votes").select("image_id");
    const map = new Map();
    data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1));
    setResults([...map.entries()].map(([image_id, count]) => ({ image_id, count })));
  };
  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 3000);
    return () => clearInterval(id);
  }, []);
  return { results, refresh: fetchResults };
}

// ---- VoteGrid page (default /) -------------------------------------------
function VoteGrid() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);
  const { refresh } = useVotes(); // only need refresh for optimistic update

  // prompt username once
  useEffect(() => {
    if (!user) {
      const n = window.prompt("Enter your name to vote:");
      if (n && n.trim()) {
        const safe = n.trim();
        setUser(safe);
        localStorage.setItem("voter_name", safe);
      }
    }
  }, [user]);

  // load existing vote
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("votes")
        .select("image_id")
        .eq("user_name", user)
        .single();
      if (data) setSelected(data.image_id);
    })();
  }, [user]);

  const castVote = async (id) => {
    if (!user) return;
    setSelected(id);
    await supabase
      .from("votes")
      .upsert({ user_name: user, image_id: id }, { onConflict: "user_name" });
    refresh();
  };

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-6 text-center">
        Who do you think is the real killer? <span className="text-lg font-normal">[User: {user || "?"}]</span>
      </h1>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 md:border-4 transition-shadow duration-200 ${selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"}`}
            onClick={() => castVote(img.id)}
          >
            <img src={img.src} alt={img.name} className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover" />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xs sm:text-sm md:text-base font-bold py-0.5 sm:py-1 md:py-2 uppercase tracking-wider">
              {img.name}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="text-center mt-6">
        <Link to="/results" className="text-blue-600 underline">
          See live results
        </Link>
      </p>
    </div>
  );
}

// ---- Histogram component --------------------------------------------------
function Histogram({ results }) {
  const total = results?.reduce((s, r) => s + r.count, 0) || 0;
  const perc = IMAGES.map((img) => {
    const c = results?.find((r) => r.image_id === img.id)?.count || 0;
    return total ? ((c / total) * 100).toFixed(2) : 0;
  });
  const data = {
    labels: IMAGES.map((i) => i.name.split(" ").join("\n")),
    datasets: [{ data: perc, backgroundColor: "rgba(54,162,235,0.8)" }],
  };
  const options = {
    indexAxis: "y",
    maintainAspectRatio: false,
    scales: {
      x: { max: 100, ticks: { callback: (v) => v + "%" } },
      y: { ticks: { autoSkip: false } },
    },
    plugins: { legend: { display: false } },
  };
  return <Bar data={data} options={options} />;
}

// ---- ResultsPage ----------------------------------------------------------
function ResultsPage() {
  const { results } = useVotes();
  const VIDEO_ID = "hooHIkOQXdg";
  const [subs, setSubs] = useState(null);

  useEffect(() => {
    (async () => {
      const s = await fetchYoutubeTranscript(VIDEO_ID);
      setSubs(s);
    })();
  }, []);

  return (
    <div className="p-2 md:p-4 max-w-screen-2xl mx-auto flex flex-col md:flex-row gap-4" style={{ height: "100vh" }}>
      {/* Video & subtitles */}
      <div className="flex-1 flex flex-col">
        <div className="aspect-w-16 aspect-h-9 w-full">
          <iframe
            src={`https://www.youtube.com/embed/${VIDEO_ID}?cc_load_policy=1`}
            title="YT video"
            className="w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="mt-2 bg-black/80 text-white p-2 rounded-lg flex-1 overflow-auto text-sm leading-snug">
          {subs ? (
            subs.map((l, i) => (
              <p key={i} className="whitespace-pre-line">
                [{new Date(l.start * 1000).toISOString().substr(14, 5)}] {l.text}
              </p>
            ))
          ) : (
            <p>Loading subtitles…</p>
          )}
        </div>
      </div>

      {/* Histogram & QR */}
      <div className="w-full md:w-96 flex flex-col">
        <div className="flex-1 bg-white rounded-lg shadow-md p-4 mb-4">
          {results && <Histogram results={results} />}
        </div>
        <div className="self-end">
          <QRCode value="https://leo-cazenille.github.io/GUESS-THE-KILLER/" size={128} />
        </div>
      </div>
    </div>
  );
}

// ---- Router ----------------------------------------------------------------
export default function App() {
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

