import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import {
  Thermometer,
  Droplets,
  Wind,
  Fan,
  Video,
  VideoOff,
  Sparkles,
  RefreshCw,
  Settings2,
  Wifi,
  WifiOff,
  ChevronRight,
  Database,
  Clock,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Konstanta & util
// ---------------------------------------------------------------------------

const METRICS = {
  suhu: {
    label: "Suhu",
    unit: "°C",
    icon: Thermometer,
    color: "#ff9466",
    glow: "rgba(255,148,102,0.35)",
    bounds: [10, 45],
    key: "suhu",
  },
  lembap: {
    label: "Kelembapan",
    unit: "%",
    icon: Droplets,
    color: "#5ec8d8",
    glow: "rgba(94,200,216,0.35)",
    bounds: [20, 95],
    key: "lembap",
  },
  voc: {
    label: "VOC (MQ-135)",
    unit: "ppm",
    icon: Wind,
    color:
