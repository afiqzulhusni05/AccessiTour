import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { deleteUser, listUsers } from "../../api";
import { FilterNote, Loading } from "../../Dash";
import type { User } from "../../types";
import { useLoad } from "../../useLoad";

const FIRST_REGISTERED_ID = 10_000; // lower ids are the built-in admin and demo guide accounts
const FIRST_TEAM_ID = 1_000_000; // accounts that live in the team API: listed here, managed there

export default function AdminUsers() {
  const { t } = useTranslation();
  const { data: users, setData: setUsers, failed } = useLoad(listUsers);
  const [params] = useSearchParams(); // ?q= and ?role= come from dashboard links
  const role = params.get("role");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [err, setErr] = useState("");

  const remove = async (u: User) => {
    if (!window.confirm(t("admin.confirmRemove", { email: u.email }))) return;
    setErr("");
    try {
      setUsers(await deleteUser(u.id));
    } catch {
      setErr(t("admin.removeFailed"));
    }
  };

  const needle = q.trim().toLowerCase();
  const shown = users?.filter((u) => (!role || u.role === role) && `${u.display_name} ${u.email}`.toLowerCase().includes(needle));

  return (
    <div className="page full">
      <h1>{t("nav.users")}{users && ` (${users.length})`}</h1>
      <div className="toolbar">
        <label>{t("dash.searchUsers")}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {role && <FilterNote label={t(`role.${role}`)} all="/admin/users" />}
      <p role="alert" className="error">{err}</p>
      {!shown ? <Loading failed={failed} /> : shown.length === 0 ? <p>{t("dash.noMatches")}</p> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>{t("admin.name")}</th><th>{t("auth.email")}</th><th>{t("admin.role")}</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>{t(`role.${u.role}`)}</td>
                  <td>
                    {u.id >= FIRST_TEAM_ID ? <span className="muted">{t("admin.teamAccount")}</span> : u.id >= FIRST_REGISTERED_ID ? (
                      <button type="button" className="ghost small" onClick={() => remove(u)} aria-label={`${t("admin.remove")}: ${u.email}`}>{t("admin.remove")}</button>
                    ) : <span className="muted">{t("admin.builtIn")}</span>}
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
