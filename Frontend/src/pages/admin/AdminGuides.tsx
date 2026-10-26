import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listGuides, verifyGuideTag } from "../../api";
import { FilterNote, Loading } from "../../Dash";
import { useLocalized } from "../../names";
import { useLoad } from "../../useLoad";

const FIRST_REGISTERED_GUIDE_ID = 1000;

export default function AdminGuides() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data: guides, setData: setGuides, failed } = useLoad(listGuides);
  const [params] = useSearchParams(); // ?q= and ?tag= come from dashboard links
  const tag = params.get("tag");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [err, setErr] = useState("");

  const verify = async (guideId: number, tag: string, verified: boolean) => {
    setErr("");
    try {
      const updated = await verifyGuideTag(guideId, tag, verified);
      setGuides((all) => all && all.map((g) => (g.id === updated.id ? updated : g)));
    } catch {
      setErr(t("verify.failed"));
    }
  };

  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";
  const needle = q.trim().toLowerCase();
  const shown = guides?.filter((g) => (!tag || g.access_tags.includes(tag)) &&
    `${g.name} ${g.name_ko} ${g.regions.join(" ")} ${list(g.regions, "region")}`.toLowerCase().includes(needle));

  return (
    <div className="page full">
      <h1>{t("nav.guides")}{guides && ` (${guides.length})`}</h1>
      <div className="toolbar">
        <label>{t("dash.searchGuides")}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {tag && <FilterNote label={t(`tag.${tag}`)} all="/admin/guides" />}
      <p role="alert" className="error">{err}</p>
      {!shown ? <Loading failed={failed} /> : shown.length === 0 ? <p>{t("dash.noMatches")}</p> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{t("dash.guide")}</th><th>{t("dash.cities")}</th><th>{t("dash.languages")}</th>
                <th className="num">{t("dash.rate")}</th><th className="num">{t("dash.rating")}</th><th>{t("factor.accessibility")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.id}>
                  <td>{loc(g.name, g.name_ko)}</td>
                  <td>{list(g.regions, "region")}</td>
                  <td>{list(g.languages, "lang")}</td>
                  <td className="num">₩{g.daily_rate.toLocaleString()}</td>
                  <td className="num">{g.review_count ? `★ ${g.rating.toFixed(1)} (${g.review_count})` : "–"}</td>
                  <td>
                    {g.access_tags.length === 0 ? "–" : (
                      <div className="verify">
                        {g.access_tags.map((tag) => {
                          const ok = g.verified_tags.includes(tag);
                          const action = t(ok ? "verify.unverify" : "verify.verify");
                          return (
                            <span key={tag}>
                              {t(`tag.${tag}`)}{ok ? " ✓" : ""}
                              {/* sample guides are fixed; only registered ones can be checked */}
                              {g.id >= FIRST_REGISTERED_GUIDE_ID && (
                                <button type="button" className="ghost" onClick={() => verify(g.id, tag, !ok)}
                                  aria-label={t("verify.label", { action, tag: t(`tag.${tag}`), name: g.name })}>{action}</button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
