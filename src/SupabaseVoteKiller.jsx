// SupabaseVoteDemo.jsx – big thumbs, minimal gaps, names overlay on photos
// -----------------------------------------------------------------------------
// • Overlays each character name directly on the photo (white bold text, dark
//   translucent strip, Tekken‑style).
// • Enlarges chart thumbs to 56 px; sets bar & category percentage to 0.98 so
//   bars (and thus thumbs) sit almost flush with minimal gap.
// • Tick label font sizes bumped (x: 16, y: 14).
// • Image cards taller (h‑80 ≈ 320 px) to fill screen better.
// -----------------------------------------------------------------------------

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// ---- Chart.js setup --------------------------------------------------------
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

// ---- Supabase client -------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- Images + character names ---------------------------------------------
const NAMES = [
  "D. Poiré",
  "Jane Blond",
  "D. Doubledork",
  "The Director",
  "Dr. Lafayette",
  "Spiderman",
  "Mew‑the‑ripper",
  "Researcher Catnip",
  "QTRobot",
  "Pepper",
  "Freaky Franka",
  "Greta",
];

const IMAGES = Array.from({ length: 12 }, (_, i) => {
  const id = i + 1;
  return {
    id,
    name: NAMES[i],
    src: `photos/${id}.jpg`,
  };
});

// ---- Thumbnail plugin ------------------------------------------------------
const thumbs = IMAGES.map((img) => {
  const image = new window.Image();
  image.src = img.src;
  return image;
});

const thumbPlugin = {
  id: "xThumbs",
  afterDraw(chart, _args, opts) {
    const { ctx, scales } = chart;
    const size = opts.size || 56; // larger thumbs
    const yOffset = opts.offset || 12;
    scales.x.ticks.forEach((_tick, index) => {
      const xPos = scales.x.getPixelForTick(index);
      const img = thumbs[index];
      if (!img.complete) img.onload = () => chart.draw();
      const yPos = scales.x.bottom + yOffset;
      ctx.save();
      ctx.beginPath();
      ctx.rect(xPos - size / 2, yPos, size, size);
      ctx.clip();
      ctx.drawImage(img, xPos - size / 2, yPos, size, size);
      ctx.restore();
    });
  },
};
ChartJS.register(thumbPlugin);

export default function SupabaseVoteDemo() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState(null);

  // --- Ask for a name -------------------------------------------------------
  useEffect(() => {
    if (!user) {
      const name = window.prompt("Enter your name to vote:");
      if (name && name.trim()) {
        const safe = name.trim();
        setUser(safe);
        localStorage.setItem("voter_name", safe);
      }
    }
  }, [user]);

  // --- Pre‑load user vote ---------------------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("votes").select("image_id").eq("user_name", user).single();
      if (data) setSelected(data.image_id);
    })();
  }, [user]);

  // --- Fetch counts ---------------------------------------------------------
  const fetchResults = async () => {
    const { data, error } = await supabase.from("votes").select("image_id");
    if (error) return console.error("Fetch results error:", error);
    const map = new Map();
    data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1));
    setResults(Array.from(map.entries()).map(([image_id, count]) => ({ image_id, count })));
  };

  // Poll every 3 s
  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 3000);
    return () => clearInterval(id);
  }, []);

  // Vote
  const castVote = async (imageId) => {
    if (!user) return;
    setSelected(imageId);
    const { error } = await supabase.from("votes").upsert({ user_name: user, image_id: imageId }, { onConflict: "user_name" });
    if (error) console.error("Vote error:", error);
    fetchResults();
  };

  // Chart data/options -------------------------------------------------------
  const { data, options } = useMemo(() => {
    const counts = IMAGES.map((img) => results?.find((r) => r.image_id === img.id)?.count || 0);
    return {
      data: {
        labels: IMAGES.map((img) => img.name),
        datasets: [{
          label: "Votes",
          data: counts,
          backgroundColor: "rgba(54, 162, 235, 0.7)",
          barPercentage: 0.98,
          categoryPercentage: 0.98,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 80 } },
        plugins: { legend: { display: false }, xThumbs: { size: 56, offset: 12 } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: false, font: { size: 16 } } },
          y: { beginAtZero: true, precision: 0, ticks: { font: { size: 14 } } },
        },
      },
    };
  }, [results]);

  // Render ------------------------------------------------------------------
  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-center">
        Who do you think is the real killer? <span className="text-lg font-normal">[User: {user || "?"}]</span>
      </h1>

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            className={`relative cursor-pointer rounded-xl overflow-hidden border-4 transition-shadow duration-200 ${selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"}`}
            onClick={() => castVote(img.id)}
          >
            <img src={img.src} alt={img.name} className="w-full h-80 object-cover" />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-lg font-bold py-2 uppercase tracking-wider">
              {img.name}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Histogram */}
      {results && (
        <div className="mt-12 bg-white rounded-xl p-6 shadow-md" style={{ height: "550px" }}>
          <Bar data={data} options={options} />
        </div>
      )}
    </div>
  );
}

