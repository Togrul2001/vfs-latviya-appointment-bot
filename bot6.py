import os
import time
import datetime
import threading
import traceback
import requests
import pandas as pd
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# --- KONFİQURASİYA (HƏQİQİ REJİM - AZƏRBAYCAN) ---
EXCEL_FILE = "applicants.xlsx"
URL = "https://pieraksts.mfa.gov.lv/en/azerbaijan"
CHROME_VERSION = 152

RETRY_DELAY_SECONDS = 15                 # Kəşfiyyatçının iki yoxlaması arasındakı fasilə
CLOSE_BROWSER_AFTER_SUCCESS_SECONDS = 2  # Yer götürüldükdən neçə saniyə sonra brauzer bağlansın
DEFAULT_END_DAYS = 180                   # tarix_bitis boşdursa / keçibsə: bu gündən +180 gün

# 📬 TELEGRAM — köhnə token paylaşıldığı üçün @BotFather-də /revoke edib YENİSİNİ bura yazın
TELEGRAM_TOKEN = "BURA_YENI_TOKENI_YAZIN"
TELEGRAM_CHAT_ID = "8090158342"

IGNORE_EXCEL_DATES_FOR_TESTING = False

# --- Qlobal vəziyyət (thread-safe) ---
state_lock = threading.Lock()
excel_lock = threading.Lock()
driver_create_lock = threading.Lock()   # uc.Chrome eyni anda 2 dəfə yaradılanda çökür

# Excel 'status' sütunundakı dəyərlər (açılan siyahı ilə eyni yazılmalıdır)
STATUS_BOOKED = "Yer götürüldü"
# Bu statuslu qruplar üçün axtarış APARILMIR ("Boş" və "Gözləyir" axtarılır)
SKIP_STATUSES = {"yer götürüldü", "görüşü var", "1", "1.0"}

COMPLETED_GROUPS = set()     # Yer götürülmüş qruplar — axtarış bunlar üçün dayanır
IN_PROGRESS_GROUPS = set()   # Hazırda işçi brauzerdə rezervasiya edilən qruplar
NOTIFIED_OUT_OF_RANGE = set()


# ---------------------------------------------------------------- TELEGRAM
def send_tg_notification(message):
    if not TELEGRAM_TOKEN or "BURA_" in TELEGRAM_TOKEN:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {"chat_id": TELEGRAM_CHAT_ID, "text": f"🤖 [SƏFİRLİK BOTU]\n\n{message}"}
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"[!] Teleqram bildirişi göndərilərkən xəta: {e}")


# ---------------------------------------------------------------- EXCEL
def _norm(v):
    return "" if v is None else str(v).strip().lower()


def mark_group_as_completed_in_excel(qrup_id, note):
    """openpyxl ilə yalnız lazım olan xanaları dəyişir — açılan siyahı (dropdown), rənglər və format QORUNUR.
    Qrupun bütün sətirlərinə status='Yer götürüldü', 'qeyd' sütununa isə tarix/saat yazılır."""
    from openpyxl import load_workbook
    with excel_lock:
        for attempt in range(1, 6):
            try:
                wb = load_workbook(EXCEL_FILE)
                ws = wb.active
                headers = {_norm(c.value): c.column for c in ws[1] if c.value is not None}
                if "qrup_id" not in headers or "status" not in headers:
                    raise Exception("Excel-də 'qrup_id' və ya 'status' sütunu tapılmadı")
                id_col, status_col = headers["qrup_id"], headers["status"]
                if "qeyd" in headers:
                    note_col = headers["qeyd"]
                else:
                    note_col = ws.max_column + 1
                    ws.cell(row=1, column=note_col, value="qeyd")

                current_id, changed = None, 0
                for r in range(2, ws.max_row + 1):
                    raw = ws.cell(row=r, column=id_col).value
                    if raw not in (None, ""):
                        try:
                            current_id = int(float(raw))
                        except Exception:
                            current_id = None
                    if current_id == qrup_id:   # boş qrup_id xanaları yuxarıdakı qrupa aiddir
                        ws.cell(row=r, column=status_col, value=STATUS_BOOKED)
                        ws.cell(row=r, column=note_col, value=note)
                        changed += 1

                wb.save(EXCEL_FILE)
                print(f"[💾 EXCEL] Qrup {qrup_id}: {changed} sətir → status='{STATUS_BOOKED}', qeyd='{note}'")
                return True
            except Exception as e:
                print(f"[⚠️ EXCEL] Yazmaq alınmadı (cəhd {attempt}/5) — Excel açıqdırsa bağlayın: {e}")
                time.sleep(3)
    send_tg_notification(f"⚠️ Qrup {qrup_id} üçün yer götürüldü, amma Excel-ə yazıla bilmədi!\nQeyd: {note}\nƏl ilə '{STATUS_BOOKED}' seçin.")
    return False


def _parse_viza(val):
    try:
        if isinstance(val, (int, float)) and not pd.isna(val):
            return int(val)
        if isinstance(val, str):
            return int(''.join(c for c in val if c.isdigit()))
    except Exception:
        pass
    return 1


def parse_excel_groups(filepath):
    with excel_lock:
        if not os.path.exists(filepath):
            print(f"[!] Xəta: '{filepath}' faylı tapılmadı!")
            return {}
        try:
            df = pd.read_excel(filepath)
        except Exception as e:
            print(f"[⚠️ EXCEL KİLİDİ] Excel oxunmadı (fayl açıq ola bilər): {e}")
            return {}

    if df.empty:
        return {}

    df['qrup_id'] = pd.to_numeric(df['qrup_id'], errors='coerce').ffill()
    df = df.dropna(subset=['qrup_id'])
    df['qrup_id'] = df['qrup_id'].astype(float).astype(int)

    if 'status' not in df.columns:
        df['status'] = ""
    df['status'] = df['status'].apply(lambda v: "" if pd.isna(v) else str(v).strip().lower())

    groups = {}
    today = datetime.date.today()

    for q_id, group_df in df.groupby('qrup_id'):
        if group_df['status'].isin(SKIP_STATUSES).any():
            continue

        rows = group_df.to_dict(orient='records')
        if not rows:
            continue
        main_row = rows[0]

        email = str(main_row.get('mail', '')).strip()
        if '@' not in email or pd.isna(main_row.get('mail')) or email.lower() == 'nan':
            ad_clean = str(main_row['ad']).strip().lower()
            soyad_clean = str(main_row['soyad']).strip().lower()
            email = f"{ad_clean}.{soyad_clean}@mail.ru"
            print(f"[⚠️] Qrup {q_id}: e-poçt yoxdur, saxta ünvan yaradıldı ({email}) — təsdiq məktubu ərizəçiyə çatmayacaq!")

        phone_val = main_row.get('telefon', main_row.get('telefon.1', ''))
        if pd.isna(phone_val) or str(phone_val).strip() == '' or str(phone_val).strip().lower() == 'nan':
            phone = "+994555556025"
        else:
            phone_str = str(phone_val).strip()
            if '.' in phone_str:
                phone_str = phone_str.split('.')[0]
            phone_str = ''.join(c for c in phone_str if c.isdigit())
            phone = f"+994{phone_str}" if len(phone_str) == 9 else (f"+{phone_str}" if phone_str.startswith("994") else phone_str)

        t_start = main_row.get('tarix_baslangic', pd.NaT)
        t_end = main_row.get('tarix_bitis', pd.NaT)

        t_start_dt = today if pd.isna(t_start) else pd.to_datetime(t_start).date()
        if pd.isna(t_end) or pd.to_datetime(t_end).date() < today:
            # Köhnə kodda burada 2026-08-31 idi — o tarix artıq keçib və qrup heç vaxt uyğun gəlmirdi
            t_end_dt = today + datetime.timedelta(days=DEFAULT_END_DAYS)
        else:
            t_end_dt = pd.to_datetime(t_end).date()

        main_applicant = {
            "name": str(main_row['ad']).strip().upper(),
            "surname": str(main_row['soyad']).strip().upper(),
            "email": email,
            "phone": phone,
            "viza_novu": _parse_viza(main_row.get('viza_novu', 1)),
        }
        additional_visitors = [{
            "name": str(r['ad']).strip().upper(),
            "surname": str(r['soyad']).strip().upper(),
            "viza_novu": _parse_viza(r.get('viza_novu', 1)),
        } for r in rows[1:]]

        groups[q_id] = {
            "qrup_id": q_id,
            "main_applicant": main_applicant,
            "additional_visitors": additional_visitors,
            "tarix_baslangic": t_start_dt,
            "tarix_bitis": t_end_dt,
        }
    return groups


def group_accepts_date(g_data, d):
    return IGNORE_EXCEL_DATES_FOR_TESTING or (g_data["tarix_baslangic"] <= d <= g_data["tarix_bitis"])


# ---------------------------------------------------------------- BRAUZER
def setup_driver(suffix="default"):
    options = uc.ChromeOptions()
    profile_path = os.path.abspath(f"bot_profile_{suffix}")
    options.add_argument(f"--user-data-dir={profile_path}")
    options.add_argument("--disk-cache-size=10485760")
    options.add_argument("--media-cache-size=5242880")
    options.add_argument("--no-first-run")
    options.add_argument("--no-service-autorun")
    options.add_argument("--password-store=basic")
    with driver_create_lock:
        driver = uc.Chrome(version_main=CHROME_VERSION, options=options)
    driver.maximize_window()
    return driver


def safe_quit(driver):
    if driver is None:
        return
    try:
        driver.quit()
    except Exception:
        pass


def driver_is_alive(driver):
    try:
        _ = driver.title
        return True
    except Exception:
        return False


def clear_all_site_data(driver):
    try:
        driver.execute_cdp_cmd('Storage.clearDataForOrigin', {
            'origin': 'https://pieraksts.mfa.gov.lv',
            'storageTypes': 'all'
        })
    except Exception:
        try:
            driver.delete_all_cookies()
            driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
        except Exception:
            pass


def force_fill_input(driver, element, text):
    driver.execute_script("""
        arguments[0].value = '';
        arguments[0].value = arguments[1];
        arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
    """, element, text)


# ---------------------------------------------------------------- FORM ADDIMLARI (dəyişməyib)
def fill_form_for_group(driver, group_data):
    wait = WebDriverWait(driver, 10)

    for field_id, value in [
        ("Persons[0][first_name]", group_data["main_applicant"]["name"]),
        ("Persons[0][last_name]", group_data["main_applicant"]["surname"]),
        ("e_mail", group_data["main_applicant"]["email"]),
        ("e_mail_repeat", group_data["main_applicant"]["email"]),
        ("phone", group_data["main_applicant"]["phone"]),
    ]:
        el = wait.until(EC.presence_of_element_located((By.ID, field_id)))
        el.clear()
        force_fill_input(driver, el, value)

    for index, visitor in enumerate(group_data["additional_visitors"]):
        dom_index = index + 1
        add_button = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'js-addVisitor')]")))
        driver.execute_script("arguments[0].click();", add_button)

        add_name_field = wait.until(EC.presence_of_element_located((By.ID, f"Persons[{dom_index}][first_name]")))
        add_surname_field = wait.until(EC.presence_of_element_located((By.ID, f"Persons[{dom_index}][last_name]")))
        add_name_field.clear()
        force_fill_input(driver, add_name_field, visitor["name"])
        add_surname_field.clear()
        force_fill_input(driver, add_surname_field, visitor["surname"])

    time.sleep(0.5)
    next_step_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//*[@id='step1-next-btn']//button")))
    driver.execute_script("arguments[0].click();", next_step_btn)


def select_service_and_consent(driver, group_data):
    wait = WebDriverWait(driver, 12)
    print("[~] Xidmət və razılıq addımı işlənilir...")

    sections = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "section-base--wrapper")))
    num_visitors = len(sections)

    for index in range(num_visitors):
        if index == 0:
            current_viza_novu = group_data["main_applicant"]["viza_novu"]
        else:
            current_viza_novu = group_data["additional_visitors"][index - 1]["viza_novu"]

        visa_option_text = "Processing a Schengen visa" if current_viza_novu == 1 else "Processing a Latvian national visa"
        print(f"[~] Ərizəçi {index + 1}/{num_visitors} növü: {visa_option_text}")

        sections = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "section-base--wrapper")))
        current_section = sections[index]
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", current_section)
        time.sleep(0.3)

        dropdown = current_section.find_element(By.CLASS_NAME, "js-services")
        driver.execute_script("arguments[0].click();", dropdown)
        time.sleep(0.6)

        visa_labels = current_section.find_elements(By.CLASS_NAME, "text--dropdown-service")
        target_label = next((l for l in visa_labels if visa_option_text.lower() in l.text.lower()), None)
        driver.execute_script("arguments[0].click();", target_label or visa_labels[0])
        time.sleep(0.8)

        try:
            active_section = current_section.find_element(By.XPATH, ".//section[contains(@class, 'description') and contains(@class, 'active')]")
            checkbox = active_section.find_element(By.ID, "active-confirmation")
            cb_label = active_section.find_element(By.XPATH, ".//label[@for='active-confirmation']")
            driver.execute_script("arguments[0].click();", cb_label)
            driver.execute_script("""
                arguments[0].checked = true;
                arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
            """, checkbox)
        except Exception as e:
            print(f"[!] Razılıq checkbox-u xəbərdarlığı (Ərizəçi {index + 1}): {e}")
        time.sleep(0.6)

        try:
            add_btn = current_section.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Add') or contains(text(), 'Add')]")
            driver.execute_script("""
                arguments[0].scrollIntoView({block: 'center'});
                arguments[0].click();
            """, add_btn)
            print(f"[+] Ərizəçi {index + 1} üçün xidmət əlavə edildi.")
        except Exception as e:
            print(f"[!] Add düyməsi xətası (Ərizəçi {index + 1}): {e}")
        time.sleep(1.2)

    next_step_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(text(), 'Next step')]")))
    driver.execute_script("arguments[0].click();", next_step_btn)
    print("[+] Qrup üzvləri tamamlandı. Təqvimə keçilir.")
    return True


# ---------------------------------------------------------------- TƏQVİM
NEXT_MONTH_XPATH = "//*[text()='>' or contains(@class, 'arrow-right') or contains(@class, 'next')]"


def read_active_days(driver):
    days = []
    for el in driver.find_elements(By.XPATH, "//td[contains(@class, 'cal-active')]"):
        try:
            raw = el.get_attribute("data-date")
            if not raw:
                continue
            y, m, d = [int(x) for x in raw.split('-')]
            days.append((datetime.date(y, m, d), raw))
        except Exception:
            continue
    return days


def scan_calendar(driver):
    """İki ayı tarayır, HEÇ NƏYƏ KLİKLƏMİR. Bütün aktiv günləri qaytarır + hazırda göstərilən ayın indeksi."""
    wait = WebDriverWait(driver, 10)
    found, seen, current_month = [], set(), 0

    for month_index in range(2):
        wait.until(EC.presence_of_element_located((By.ID, "calendar-daygrid")))
        for d, raw in read_active_days(driver):
            if raw in seen:
                continue
            seen.add(raw)
            found.append({"date": d, "raw": raw, "month_index": month_index})
            print(f"[🔥] Aktiv gün tapıldı: {d}")

        if month_index == 0:
            try:
                btn = driver.find_element(By.XPATH, NEXT_MONTH_XPATH)
                driver.execute_script("arguments[0].click();", btn)
                time.sleep(1.2)
                current_month = 1
            except Exception:
                break

    found.sort(key=lambda x: x["date"])
    return found, current_month


def plan_assignments(days, groups):
    """Hər qrupa öz aralığına düşən ƏN ERKƏN günü təyin edir.
    Eyni günə düşən qruplar fərqli saat indeksləri alır ki, eyni saat üçün bir-birinə mane olmasınlar."""
    plan, per_day_count = {}, {}
    for gid in sorted(groups):
        for day in days:
            if group_accepts_date(groups[gid], day["date"]):
                idx = per_day_count.get(day["raw"], 0)
                per_day_count[day["raw"]] = idx + 1
                plan[gid] = {**day, "time_index": idx}
                break
    return plan


def notify_out_of_range(days, groups):
    for day in days:
        d = day["date"]
        if any(group_accepts_date(g, d) for g in groups.values()):
            continue
        if d in NOTIFIED_OUT_OF_RANGE:
            continue
        NOTIFIED_OUT_OF_RANGE.add(d)
        msg = (f"⚠️ [KƏNAR TARİX AÇILDI]\n\n📅 Tarix: {d}\n\n"
               f"Heç bir aktiv qrupun aralığına düşmür — bot bu yeri götürmədi.")
        print(msg)
        send_tg_notification(msg)


def click_date_in_view(driver, raw):
    els = driver.find_elements(By.XPATH, f"//td[contains(@class, 'cal-active') and @data-date='{raw}']")
    if not els:
        return False
    driver.execute_script("arguments[0].click();", els[0])
    return True


def click_date_with_navigation(driver, raw):
    """Təqvim 1-ci aydadır: gün burada yoxdursa növbəti aya keçib axtarır."""
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "calendar-daygrid")))
    if click_date_in_view(driver, raw):
        return
    btn = driver.find_element(By.XPATH, NEXT_MONTH_XPATH)
    driver.execute_script("arguments[0].click();", btn)
    time.sleep(1.2)
    if not click_date_in_view(driver, raw):
        raise Exception(f"{raw} günü təqvimdə artıq aktiv deyil (başqası götürmüş ola bilər).")


# ---------------------------------------------------------------- SAAT + TƏSDİQ
def select_time_and_finalize(driver, qrup_id, time_index=0):
    """Saatı seçir, GDPR-i işarələyir, Approve basır. (saat_mətni, səhifə_dəyişdimi) qaytarır."""
    wait = WebDriverWait(driver, 15)
    print(f"[~] Qrup {qrup_id}: saat seçimi gözlənilir...")

    select_el = wait.until(EC.presence_of_element_located((By.XPATH, "//select[@class='time' or contains(@name, 'visit_time')]")))
    dropdown = Select(select_el)
    valid = [o for o in dropdown.options if (o.get_attribute("value") or "").strip()]
    if not valid:
        raise Exception("Saat siyahısı boşdur — gün artıq dolub.")

    chosen = valid[min(time_index, len(valid) - 1)]
    dropdown.select_by_value(chosen.get_attribute("value"))
    selected_time_text = chosen.text.strip()
    print(f"[+] Qrup {qrup_id}: seçilən saat {selected_time_text}")
    time.sleep(0.5)

    next_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//*[@id='step3-next-btn']//button")))
    driver.execute_script("arguments[0].click();", next_btn)

    gdpr_cb = wait.until(EC.presence_of_element_located((By.ID, "personal-data")))
    try:
        gdpr_label = driver.find_element(By.XPATH, "//label[@for='personal-data']")
        driver.execute_script("arguments[0].click();", gdpr_label)
    except Exception:
        pass
    driver.execute_script("arguments[0].checked = true; arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", gdpr_cb)
    time.sleep(1.0)

    approve_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(normalize-space(), 'Approve')]")))
    old_url = driver.current_url
    driver.execute_script("arguments[0].click();", approve_btn)

    # Approve-dan sonra səhifə dəyişdimi? (düymə yox oldu və ya URL dəyişdi)
    try:
        WebDriverWait(driver, 15).until(lambda d: d.current_url != old_url or not approve_btn.is_displayed())
        confirmed = True
    except Exception:
        # StaleElement da "səhifə dəyişdi" deməkdir
        try:
            approve_btn.is_displayed()
            confirmed = False
        except Exception:
            confirmed = True
    return selected_time_text, confirmed


def full_booking_flow(driver, group_data, raw_date, time_index):
    """Sıfırdan: forma → xidmət → təqvim → gün → saat → Approve."""
    driver.get(URL)
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "Persons[0][first_name]")))
    fill_form_for_group(driver, group_data)
    select_service_and_consent(driver, group_data)
    click_date_with_navigation(driver, raw_date)
    return select_time_and_finalize(driver, group_data["qrup_id"], time_index)


# ---------------------------------------------------------------- NƏTİCƏ
def format_people(group_data):
    """Qrupdakı BÜTÜN şəxslərin ad-soyadını nömrələnmiş siyahı kimi qaytarır."""
    people = [group_data["main_applicant"]] + group_data["additional_visitors"]
    return "\n".join(f"   {i}. {p['name']} {p['surname']}" for i, p in enumerate(people, 1))


def on_booking_success(group_data, target_date, time_text, confirmed):
    gid = group_data["qrup_id"]
    with state_lock:
        COMPLETED_GROUPS.add(gid)
        IN_PROGRESS_GROUPS.discard(gid)

    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    note = f"Yer götürüldü: {target_date} {time_text} (bot: {stamp})"
    if not confirmed:
        note += " — YOXLAYIN"
    mark_group_as_completed_in_excel(gid, note)

    a = group_data["main_applicant"]
    msg = (f"🎉 [REZERVASIYA TAMAMLANDI]\n\n"
           f"👤 Şəxslər ({1 + len(group_data['additional_visitors'])} nəfər):\n{format_people(group_data)}\n"
           f"📧 {a['email']}\n📅 {target_date}\n⏰ {time_text}\n👥 Qrup ID: {gid}")
    if not confirmed:
        msg += "\n\n⚠️ Approve-dan sonra səhifə dəyişmədi — e-poçtu / saytı əl ilə yoxlayın!"
    print(f"\n{msg}")
    send_tg_notification(msg)


def on_booking_failure(group_data, target_date, err):
    gid = group_data["qrup_id"]
    with state_lock:
        IN_PROGRESS_GROUPS.discard(gid)   # növbəti dövrdə yenidən axtarılacaq
    msg = f"❌ Qrup {gid} üçün {target_date} götürülə bilmədi: {err}\n{format_people(group_data)}\nAxtarış davam edir."
    print(msg)
    send_tg_notification(msg)


def run_worker_bot(group_data, target_date, raw_date, time_index):
    gid = group_data["qrup_id"]
    print(f"\n[🚀 İŞÇİ BOT] Qrup {gid} → {target_date} (saat indeksi {time_index})")
    w_driver = None
    try:
        w_driver = setup_driver(suffix=f"worker_{gid}")
        time_text, confirmed = full_booking_flow(w_driver, group_data, raw_date, time_index)
        on_booking_success(group_data, target_date, time_text, confirmed)
        time.sleep(CLOSE_BROWSER_AFTER_SUCCESS_SECONDS)
    except Exception as e:
        on_booking_failure(group_data, target_date, e)
    finally:
        safe_quit(w_driver)
        print(f"[🔒] İşçi brauzer bağlandı (Qrup {gid}).")


def launch_worker(group_data, assignment):
    gid = group_data["qrup_id"]
    with state_lock:
        if gid in IN_PROGRESS_GROUPS or gid in COMPLETED_GROUPS:
            return
        IN_PROGRESS_GROUPS.add(gid)
    t = threading.Thread(target=run_worker_bot,
                         args=(group_data, assignment["date"], assignment["raw"], assignment["time_index"]),
                         daemon=True)
    t.start()


# ---------------------------------------------------------------- MAIN
def main():
    print("[*] Bot AZƏRBAYCAN CANLI REJİMİNDƏ başladıldı.")
    send_tg_notification("🚀 Bot başladıldı! Bütün qruplar üçün təqvim izlənilir. 🎯")

    driver = None
    attempt = 1
    try:
        while True:
            all_groups = parse_excel_groups(EXCEL_FILE)
            with state_lock:
                busy = COMPLETED_GROUPS | IN_PROGRESS_GROUPS
            free_groups = {g: d for g, d in all_groups.items() if g not in busy}

            if not free_groups:
                print("\n[~] Axtarılacaq aktiv qrup yoxdur (hamısı götürülüb və ya işçidədir). 7 san sonra yoxlanacaq...")
                time.sleep(7)
                continue

            scout_id = min(free_groups)
            scout_data = free_groups[scout_id]
            print(f"\n[~] Cəhd #{attempt}: kəşfiyyatçı Qrup {scout_id} ilə yoxlayır. "
                  f"Aktiv qruplar: {sorted(free_groups)}")

            try:
                if driver is None or not driver_is_alive(driver):
                    safe_quit(driver)
                    driver = setup_driver(suffix="scout")

                driver.get(URL)
                WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "Persons[0][first_name]")))
                fill_form_for_group(driver, scout_data)
                select_service_and_consent(driver, scout_data)

                days, current_month = scan_calendar(driver)
                if not days:
                    print("[-] Bu ay və növbəti ayda boş yer yoxdur.")
                else:
                    notify_out_of_range(days, free_groups)
                    plan = plan_assignments(days, free_groups)

                    if plan:
                        lines = "\n\n".join(f"👥 Qrup {g} — 📅 {a['date']}\n{format_people(free_groups[g])}" for g, a in sorted(plan.items()))
                        msg = f"🔥 [UYĞUN TARİX(LƏR) TAPILDI]\n\n{lines}\n\nRezervasiyaya başlanılır..."
                        print(msg)
                        send_tg_notification(msg)

                    # 1) Digər qruplar — hər biri öz brauzerində PARALEL
                    for gid, assignment in plan.items():
                        if gid != scout_id:
                            launch_worker(free_groups[gid], assignment)

                    # 2) Kəşfiyyatçının öz qrupu — elə bu brauzerdə
                    if scout_id in plan:
                        a = plan[scout_id]
                        with state_lock:
                            IN_PROGRESS_GROUPS.add(scout_id)
                        try:
                            if a["month_index"] == current_month and click_date_in_view(driver, a["raw"]):
                                time_text, confirmed = select_time_and_finalize(driver, scout_id, a["time_index"])
                            else:
                                time_text, confirmed = full_booking_flow(driver, scout_data, a["raw"], a["time_index"])
                            on_booking_success(scout_data, a["date"], time_text, confirmed)
                            time.sleep(CLOSE_BROWSER_AFTER_SUCCESS_SECONDS)
                        except Exception as e:
                            on_booking_failure(scout_data, a["date"], e)
                        finally:
                            # Uğurlu/uğursuz — brauzer bağlanır, növbəti dövrdə təzəsi açılır
                            safe_quit(driver)
                            driver = None
                            print("[🔒] Kəşfiyyatçı brauzer bağlandı.")

            except Exception as e:
                print(f"[!] Döngü daxili xəta: {e}")
                traceback.print_exc()

            if driver is not None:
                clear_all_site_data(driver)

            print(f"[⏳] Növbəti cəhd üçün {RETRY_DELAY_SECONDS} saniyə gözlənilir...")
            time.sleep(RETRY_DELAY_SECONDS)
            attempt += 1

    except KeyboardInterrupt:
        print("\n[-] Sistem dayandırıldı.")
    finally:
        safe_quit(driver)


if __name__ == "__main__":
    main()
