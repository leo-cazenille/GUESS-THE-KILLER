// SupabaseVoteDemo.jsx – larger layout, dynamic title, bigger thumbs below labels
// -----------------------------------------------------------------------------
// • Title: "Who do you think is the real killer? [User: <name>]".
// • Image thumbnails in grid are larger (h‑64 ≈ 256 px).
// • Chart container height bumped to 500 px, full‑width.
// • Thumbnail plugin draws 32 px icons **below** tick labels (uses scale.bottom).
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
    const size = opts.size || 32;
    const yOffset = opts.offset || 10;
    scales.x.ticks.forEach((_tick, index) => {
      const xPos = scales.x.getPixelForTick(index);
      const img = thumbs[index];
      if (!img.complete) {
        img.onload = () => chart.draw();
      }
      const yPos = scales.x.bottom + yOffset; // below tick labels
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

  // --- Pre‑load user’s previous vote ---------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("votes").select("image_id").eq("user_name", user).single();
      if (data) setSelected(data.image_id);
    })();
  }, [user]);

  // --- Fetch histogram counts ---------------------------------------------
  const fetchResults = async () => {
    const { data, error } = await supabase.from("votes").select("image_id");
    if (error) {
      console.error("Fetch results error:", error);
      return;
    }
    const countsMap = new Map();
    data.forEach(({ image_id }) => {
      countsMap.set(image_id, (countsMap.get(image_id) || 0) + 1);
    });
    const counted = Array.from(countsMap.entries()).map(([image_id, count]) => ({ image_id, count }));
    setResults(counted);
  };

  // --- Poll every 3 s -------------------------------------------------------
  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 3000);
    return () => clearInterval(id);
  }, []);

  // --- Vote handler ---------------------------------------------------------
  const castVote = async (imageId) => {
    if (!user) return;
    setSelected(imageId);
    const { error } = await supabase.from("votes").upsert({ user_name: user, image_id: imageId }, { onConflict: "user_name" });
    if (error) console.error("Vote error:", error);
    fetchResults();
  };

  // --- Chart data & options -------------------------------------------------
  const { data, options } = useMemo(() => {
    const counts = IMAGES.map((img) => {
      const row = results?.find((r) => r.image_id === img.id);
      return row ? row.count : 0;
    });

    return {
      data: {
        labels: IMAGES.map((img) => img.name),
        datasets: [
          {
            label: "Votes",
            data: counts,
            backgroundColor: "rgba(54, 162, 235, 0.6)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 60 } }, // extra for larger icons
        plugins: {
          legend: { display: false },
          xThumbs: { size: 32, offset: 10 },
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, autoSkip: false, font: { size: 12 } },
          },
          y: { beginAtZero: true, precision: 0 },
        },
      },
    };
  }, [results]);

  // --- Render --------------------------------------------------------------
  return (
    <div className="p-4 max-w-screen-xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-center">
        Who do you think is the real killer? <span className="text-lg font-normal">[User: {user || "?"}]</span>
      </h1>

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            className={`cursor-pointer rounded-xl overflow-hidden border-4 transition-shadow duration-200 ${selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"}`}
            onClick={() => castVote(img.id)}
          >
            <img src={img.src} alt={img.name} className="w-full h-64 object-cover" />
          </figure>
        ))}
      </div>

      {/* Histogram */}
      {results && (
        <div className="mt-10 bg-white rounded-xl p-6 shadow-md" style={{ height: "500px" }}>
          <Bar data={data} options={options} />
        </div>
      )}
    </div>
  );
}

