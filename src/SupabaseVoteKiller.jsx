// SupabaseVoteDemo.jsx – % histogram, larger 90 px thumbs, rotated labels
// -----------------------------------------------------------------------------
// • Histogram now shows **percentages**; total sample size appears in the title
//   above the chart: "Results of the vote [NN samples]".
// • Thumbnails under the x‑axis are 90 px; bottom padding expanded.
// • X‑tick labels rotated 45 deg with bigger font; y‑axis ticks also larger.
// -----------------------------------------------------------------------------

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
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ---- Supabase ----------------------------------------------------------------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---- Data -------------------------------------------------------------------
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

const IMAGES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: NAMES[i],
  src: `photos/${i + 1}.jpg`,
}));

// ---- Thumb plugin -----------------------------------------------------------
const thumbs = IMAGES.map((img) => {
  const image = new Image();
  image.src = img.src;
  return image;
});

const thumbPlugin = {
  id: "xThumbs",
  afterDraw(chart, _args, opts) {
    const { ctx, scales } = chart;
    const size = opts.size || 90;
    const yOffset = opts.offset || 16;
    scales.x.ticks.forEach((_, idx) => {
      const x = scales.x.getPixelForTick(idx);
      const y = scales.x.bottom + yOffset;
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

export default function SupabaseVoteDemo() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState(null); // array of {image_id,count}

  // Prompt for name ----------------------------------------------------------
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

  // Load existing vote -------------------------------------------------------
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

  // Fetch vote counts --------------------------------------------------------
  const fetchResults = async () => {
    const { data, error } = await supabase.from("votes").select("image_id");
    if (error) return console.error("Fetch error", error);
    const map = new Map();
    data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1));
    setResults([...map.entries()].map(([image_id, count]) => ({ image_id, count })));
  };

  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 3000);
    return () => clearInterval(id);
  }, []);

  // Cast vote ----------------------------------------------------------------
  const castVote = async (id) => {
    if (!user) return;
    setSelected(id);
    const { error } = await supabase
      .from("votes")
      .upsert({ user_name: user, image_id: id }, { onConflict: "user_name" });
    if (error) console.error("Vote error", error);
    fetchResults();
  };

  // Chart data/options -------------------------------------------------------
  const { chartData, chartOpts, totalSamples } = useMemo(() => {
    const counts = IMAGES.map((img) => results?.find((r) => r.image_id === img.id)?.count || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const percents = total ? counts.map((c) => ((c / total) * 100).toFixed(2)) : counts;

    return {
      totalSamples: total,
      chartData: {
        labels: IMAGES.map((i) => i.name),
        datasets: [
          {
            label: "% of votes",
            data: percents,
            backgroundColor: "rgba(54,162,235,0.75)",
            barPercentage: 0.98,
            categoryPercentage: 0.98,
          },
        ],
      },
      chartOpts: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 120 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y}%`,
            },
          },
          xThumbs: { size: 90, offset: 16 },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: false,
              font: { size: 18 },
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => `${val}%`,
              font: { size: 16 },
            },
          },
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
        <div className="mt-12 bg-white rounded-xl p-6 shadow-md" style={{ height: "600px" }}>
          <h2 className="text-2xl font-semibold text-center mb-4">
            Results of the vote [{totalSamples} samples]
          </h2>
          <Bar data={chartData} options={chartOpts} />
        </div>
      )}
    </div>
  );
}

