// SupabaseVoteDemo.jsx – client‑side aggregation fallback
// -----------------------------------------------------------------------------
// PostgREST’s aggregate syntax is fiddly and still returning 400s in the
// user’s project.  For just 12 images, we can download the small votes table
// (image_id column only) and count client‑side—simpler, 100% reliable.
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
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

// ---- 12 local images -------------------------------------------------------
const IMAGES = Array.from({ length: 12 }, (_, i) => {
  const id = i + 1;
  return {
    id,
    src: `photos/${id}.jpg`,
    alt: `Photo ${id}`,
  };
});

export default function SupabaseVoteDemo() {
  const [user, setUser] = useState(() => localStorage.getItem("voter_name") || "");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

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

  // --- Pre‑load user’s previous vote (if any) ------------------------------
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

  // --- Vote handler ---------------------------------------------------------
  const castVote = async (imageId) => {
    if (!user) return;
    setSelected(imageId); // optimistic UI
    const { error } = await supabase
      .from("votes")
      .upsert({ user_name: user, image_id: imageId }, { onConflict: "user_name" });
    if (error) console.error("Vote error:", error);
  };

  // --- Fetch histogram counts (client‑side aggregation) -------------------
  const fetchResults = async () => {
    setLoading(true);

    const { data, error } = await supabase.from("votes").select("image_id");

    if (error) {
      console.error("Fetch results error:", error);
      setLoading(false);
      return;
    }

    // Count occurrences of each image_id
    const countsMap = new Map();
    data.forEach(({ image_id }) => {
      countsMap.set(image_id, (countsMap.get(image_id) || 0) + 1);
    });

    const counted = Array.from(countsMap.entries()).map(([image_id, count]) => ({
      image_id,
      count,
    }));

    setResults(counted);
    setLoading(false);
  };

  // --- Convert to Chart.js dataset ----------------------------------------
  const chartData = () => {
    const counts = IMAGES.map((img) => {
      const row = results?.find((r) => r.image_id === img.id);
      return row ? row.count : 0;
    });
    return {
      labels: IMAGES.map((img) => `#${img.id}`),
      datasets: [
        {
          label: "Votes",
          data: counts,
        },
      ],
    };
  };

  // --- Render --------------------------------------------------------------
  return (
    <div className="p-4 max-w-screen-lg mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">
        Vote for your favourite image
      </h1>

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {IMAGES.map((img) => (
          <figure
            key={img.id}
            className={`cursor-pointer rounded-xl overflow-hidden border-4 transition-shadow duration-200 ${
              selected === img.id ? "border-blue-500 shadow-lg" : "border-transparent"
            }`}
            onClick={() => castVote(img.id)}
          >
            <img src={img.src} alt={img.alt} className="w-full h-auto" />
          </figure>
        ))}
      </div>

      {/* Show results button */}
      <div className="flex justify-center mt-6">
        <button
          onClick={fetchResults}
          className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Loading…" : "Show results"}
        </button>
      </div>

      {/* Histogram */}
      {results && (
        <div className="mt-8">
          <Bar data={chartData()} />
        </div>
      )}
    </div>
  );
}

