import { useEffect, useState } from "react";
import { FiCheckCircle, FiClock, FiUsers } from "react-icons/fi";
import BotControlCard from "../components/BotControlCard";
import Layout from "../components/Layout";
import LiveScreen from "../components/LiveScreen";
import LogTerminal from "../components/LogTerminal";
import StatCard from "../components/StatCard";
import { getAccounts, getApplicants } from "../lib/api";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [applicantSummary, setApplicantSummary] = useState(null);
  const [seatsTaken, setSeatsTaken] = useState(null);
  const [hasAppointment, setHasAppointment] = useState(null);

  useEffect(() => {
    getAccounts()
      .then((data) => setSummary(data.summary))
      .catch(() => setSummary(null));
    getApplicants()
      .then((data) => {
        setApplicantSummary(data.summary);
        setSeatsTaken(
          data.applicants.filter((a) => a.status.trim().toLowerCase() === "yer götürüldü").length
        );
        setHasAppointment(
          data.applicants.filter((a) => a.status.trim().toLowerCase() === "görüşü var").length
        );
      })
      .catch(() => {
        setApplicantSummary(null);
        setSeatsTaken(null);
        setHasAppointment(null);
      });
  }, []);

  return (
    <Layout title="Ana Səhifə">
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BotControlCard />
        <StatCard
          icon={FiUsers}
          label="Aktiv Hesablar"
          value={summary ? `${summary.active} / ${summary.total}` : "—"}
          accent="violet"
        />
        <StatCard
          icon={FiClock}
          label="Gözləyən Ərizəçilər"
          value={applicantSummary ? `${applicantSummary.pending} / ${applicantSummary.total}` : "—"}
          accent="amber"
        />
        <StatCard
          icon={FiCheckCircle}
          label="Yer Götürüldü / Görüşü Var"
          value={seatsTaken !== null ? `${seatsTaken} / ${hasAppointment}` : "—"}
          accent="green"
        />
      </div>

      <div className="mb-6 rounded-xl border border-white/10 bg-[#161922] p-5">
        <LogTerminal />
      </div>

      <div className="rounded-xl border border-white/10 bg-[#161922] p-5">
        <LiveScreen />
      </div>
      </div>
    </Layout>
  );
}
