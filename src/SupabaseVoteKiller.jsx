// SupabaseVoteDemo.jsx – fixes: orphan token removed, “Mew the ripper”, smaller phone font
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
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Character names (dash removed)
const NAMES = [
  "D. Poiré",
  "Jane Blond",
  "D. Doubledork",
  "The Director",
  "Dr. Lafayette",
  "Spiderman",
  "Mew the ripper", // changed here
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

// ----- Thumbnail plugin (100 px icons) --------------------------------------
const thumbs = IMAGES.map((i) => {
  const img = new Image();
  img.src = i.src;
  return img;
});

const thumbPlugin = {
  id: "xThumbs",
  afterDraw(chart, _args, opts) {
    const { ctx, scales } = chart;
    const size = opts.size || 100;
    const yOff = opts.offset || 20;
    scales.x.ticks.forEach((_, idx) => {
      const x = scales.x.getPixelForTick(idx);
      const y = scales.x.bottom + yOff;
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
  const [results, setResults] = useState(null);

  // Prompt for name
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

  // Load existing vote
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

  // Fetch results
  const fetchResults = async () => {
    const { data, error } = await supabase.from("votes").select("image_id");
    if (error) return console.error(error);
    const map = new Map();
    data.forEach(({ image_id }) => map.set(image_id, (map.get(image_id) || 0) + 1));
    setResults([...map.entries()].map(([image_id, count]) => ({ image_id, count })));
  };

  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 3000);
    return () => clearInterval(id);
  }, []);

  // Cast vote
  const castVote = async (id) => {
    if (!user) return;
    setSelected(id);
    await supabase
      .from("votes")
      .upsert({ user_name: user, image_id: id }, { onConflict: "user_name" });
    fetchResults();
  };

  // Chart data / options
  const { chartData, chartOpts, total } = useMemo(() => {
    const counts = IMAGES.map((img) => results?.find((r) => r.image_id === img.id)?.count || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const perc = total ? counts.map((c) => ((c / total) * 100).toFixed(2)) : counts;

    // Wrap long labels at first space
    const wrapLabel = (s) => {
      const idx = s.indexOf(" ");
      return idx > 0 ? [s.slice(0, idx), s.slice(idx + 1)] : [s];
    };

    return {
      total,
      chartData: {
        labels: IMAGES.map((i) => wrapLabel(i.name)),
        datasets: [{
          label: "% of votes",
          data: perc,
          backgroundColor: "rgba(54,162,235,0.8)",
          barPercentage: 0.98,
          categoryPercentage: 0.98,
        }],
      },
      chartOpts: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 140 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}%` } },
          xThumbs: { size: 100, offset: 20 },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: false,
              font: { size: 20 },
            },
          },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (val) => `${val}%`,
              font: { size: 18 },
            },
          },
        },
      },
    };
  }, [results]);

  // JSX
  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-center">
        Who do you think is the real killer? <span className="text-lg font-normal">[User: {user || "?"}]</span>
      </h1>

      {/* Images – always 3×4 grid, small gaps so full grid fits on phone */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 md:border-4 transition-shadow duration-200 ${selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"}`}
            onClick={() => castVote(img.id)}
          >
            {/* portrait ratio, shrink on phones so 4 rows fit without scrolling */}
            <img
              src={img.src}
              alt={img.name}
              className="w-full h-32 sm:h-40 md:h-52 lg:h-64 xl:h-72 object-cover"
            />
            <figcaption className="absolute bottom-0 left-0 w-full bg-black/70 text-white text-center text-xs sm:text-sm md:text-base font-bold py-0.5 sm:py-1 md:py-2 uppercase tracking-wider">
              {img.name}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Histogram */}
      {results && (
        <div className="mt-12 bg-white rounded-xl p-6 shadow-md" style={{ height: "650px" }}>
          <h2 className="text-2xl font-semibold text-center mb-4">
            Results of the vote [{total} samples]
          </h2>
          <Bar data={chartData} options={chartOpts} />
        </div>
      )}
    </div>
  );
}

