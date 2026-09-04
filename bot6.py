import os
import re
import time
import datetime
import threading
import traceback
import requests  # Telegram bildirişləri üçün daxil edildi
import pandas as pd
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select

# --- KONFİQURASİYA (HƏQİQİ REJİM - AZƏRBAYCAN) ---
EXCEL_FILE = "applicants.xlsx"  
URL = "https://pieraksts.mfa.gov.lv/en/azerbaijan"  
# None = undetected_chromedriver quraşdırılmış Chrome versiyasını AVTOMATİK aşkarlayıb ona
# uyğun driver endirir. Sabit rəqəm (məs. 150) yazsaq, Chrome yeniləndikcə (serverdə 152)
# "only supports Chrome version X" xətası verir — ona görə avtomatik saxlayırıq.
CHROME_VERSION = None

# 🚨 SÜRƏT VƏ GÖZLƏMƏ AYARI (20-ci sətir) 🚨
RETRY_DELAY_SECONDS = 15 

# 📬 TELEGRAM CANLI AYARLARINIZ (TAM İNTEQRASİYA OLUNDU)
TELEGRAM_TOKEN = "8841983657:AAE7k3hOEhhb2YTAv6E_sv2hb7VLt7-5O2s"
TELEGRAM_CHAT_ID = "8090158342"

# HƏQİQİ REJİM: Yalnız Excel-dəki tarix aralığına düşən günlərə giriş ediləcək!
IGNORE_EXCEL_DATES_FOR_TESTING = False  

# Qlobal izləmə, anti-spam və təhlükəsizlik kilidləri
ALREADY_TRIGGERED = set()
NOTIFIED_OUT_OF_RANGE = set()  # Eyni kənar tarixin təkrar teleqramı doldurmaması üçün anti-spam
excel_lock = threading.Lock()  


def send_tg_notification(message):
    """Teleqram hesabınıza dərhal canlı bildiriş göndərir."""
    if not TELEGRAM_TOKEN or "BURA_" in TELEGRAM_TOKEN:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {"chat_id": TELEGRAM_CHAT_ID, "text": f"🤖 [SƏFİRLİK BOTU]\n\n{message}"}
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"[!] Teleqram bildirişi göndərilərkən xəta: {e}")


def mark_group_as_completed_in_excel(qrup_id):
    """Uğurlu qrupun Excel-dəki 'status' xanasını 1 edərək tam təhlükəsiz şəkildə yadda saxlayır."""
    with excel_lock:
        try:
            df = pd.read_excel(EXCEL_FILE)
            if 'status' not in df.columns:
                df['status'] = pd.NA
            df.loc[df['qrup_id'] == qrup_id, 'status'] = 1
            df.to_excel(EXCEL_FILE, index=False)
            print(f"[💾 EXCEL BAZA] Qrup ID {qrup_id} üçün status = 1 olaraq Excel-ə yazıldı.")
        except Exception as e:
            print(f"[!] Xəta: Excel faylına status yazılarkən problem baş verib: {e}")


def parse_excel_groups(filepath):
    """Excel faylını oxuyur və bütün tipləri zirehli formata salır."""
    with excel_lock:
        if not os.path.exists(filepath):
            print(f"[!] Xəta: '{filepath}' faylı tapılmadı!")
            return {}
        try:
            df = pd.read_excel(filepath)
        except Exception as e:
            print(f"[⚠️ EXCEL KİLİDİ] Excel faylı oxunarkən problem baş verdi (Fayl açıq qalıb bilər): {e}")
            return {}

    if df.empty:
        return {}

    df['qrup_id'] = pd.to_numeric(df['qrup_id'], errors='coerce').ffill()
    df = df.dropna(subset=['qrup_id'])
    try:
        df['qrup_id'] = df['qrup_id'].astype(int)
    except:
        df['qrup_id'] = df['qrup_id'].astype(float).astype(int)
    
    if 'status' not in df.columns:
        df['status'] = pd.NA
    else:
        df['status'] = pd.to_numeric(df['status'], errors='coerce')
    
    groups = {}
    today = datetime.date.today()

    for q_id, group_df in df.groupby('qrup_id'):
        if group_df['status'].eq(1).any():
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
        
        if pd.isna(t_start) or t_start is pd.NaT:
            t_start_dt = today
        else:
            t_start_dt = pd.to_datetime(t_start).to_pydatetime().date()
            
        if pd.isna(t_end) or t_end is pd.NaT or pd.to_datetime(t_end).to_pydatetime().date() < today:
            t_end_dt = datetime.date(2026, 8, 31)
        else:
            t_end_dt = pd.to_datetime(t_end).to_pydatetime().date()

        main_v_val = main_row.get('viza_novu', 1)
        try:
            if isinstance(main_v_val, (int, float)):
                main_viza = int(main_v_val)
            elif isinstance(main_v_val, str):
                main_viza = int(''.join(c for c in main_v_val if c.isdigit()))
            else:
                main_viza = 1
        except:
            main_viza = 1

        main_applicant = {
            "name": str(main_row['ad']).strip().upper(),
            "surname": str(main_row['soyad']).strip().upper(),
            "email": email,
            "phone": phone,
            "viza_novu": main_viza
        }
        
        additional_visitors = []
        for extra_row in rows[1:]:
            extra_v_val = extra_row.get('viza_novu', 1)
            try:
                if isinstance(extra_v_val, (int, float)):
                    extra_viza = int(extra_v_val)
                elif isinstance(extra_v_val, str):
                    extra_viza = int(''.join(c for c in extra_v_val if c.isdigit()))
                else:
                    extra_viza = 1
            except:
                extra_viza = 1
            
            additional_visitors.append({
                "name": str(extra_row['ad']).strip().upper(),
                "surname": str(extra_row['soyad']).strip().upper(),
                "viza_novu": extra_viza
            })
            
        groups[q_id] = {
            "qrup_id": q_id,
            "main_applicant": main_applicant,
            "additional_visitors": additional_visitors,
            "tarix_baslangic": t_start_dt,
            "tarix_bitis": t_end_dt
        }
        
    return groups


def setup_driver(suffix="default"):
    """🚨 YENİLƏNDİ: Həm profilləri təcrid edir, həm də diski doldurmaması üçün keş ölçüsünü kəsir."""
    options = uc.ChromeOptions()
    profile_path = os.path.abspath(f"bot_profile_{suffix}")
    options.add_argument(f"--user-data-dir={profile_path}")
    
    # 🌟 DİSK QORUYUCU: Chrome-un lazımsız fayllar yığaraq şişməsini tamamilə dayandırır
    options.add_argument("--disk-cache-size=10485760")   # Maksimum 10 MB Disk Keşi
    options.add_argument("--media-cache-size=5242880")   # Maksimum 5 MB Media Keşi
    
    options.add_argument("--no-first-run")
    options.add_argument("--no-service-autorun")
    options.add_argument("--password-store=basic")
    options.add_argument("--discourage-unused-tab-memory-handler")
    
    driver = uc.Chrome(version_main=CHROME_VERSION, options=options)
    driver.maximize_window()
    return driver


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
    """JavaScript ilə xananı sıfırlayır və tək səfərdə yazır."""
    driver.execute_script("""
        arguments[0].value = '';
        arguments[0].value = arguments[1];
        arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
    """, element, text)


def fill_form_for_group(driver, group_data):
    wait = WebDriverWait(driver, 10)
    
    # Visitor 1
    name_field = wait.until(EC.presence_of_element_located((By.ID, "Persons[0][first_name]")))
    name_field.clear()
    force_fill_input(driver, name_field, group_data["main_applicant"]["name"])
    
    surname_field = wait.until(EC.presence_of_element_located((By.ID, "Persons[0][last_name]")))
    surname_field.clear()
    force_fill_input(driver, surname_field, group_data["main_applicant"]["surname"])
    
    email_field = wait.until(EC.presence_of_element_located((By.ID, "e_mail")))
    email_field.clear()
    force_fill_input(driver, email_field, group_data["main_applicant"]["email"])
    
    email_repeat_field = wait.until(EC.presence_of_element_located((By.ID, "e_mail_repeat")))
    email_repeat_field.clear()
    force_fill_input(driver, email_repeat_field, group_data["main_applicant"]["email"])
    
    phone_field = wait.until(EC.presence_of_element_located((By.ID, "phone")))
    phone_field.clear()
    force_fill_input(driver, phone_field, group_data["main_applicant"]["phone"])
    
    # Visitor 2+
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
    """
    HTML STRUKTURUNA TAM UYGUNLAŞDIRILMIŞ DÜZƏLİŞ:
    Hər ərizəçinin 'section-base--wrapper' kartı daxilində sırayla:
    1. Dropdown vurulur.
    2. Viza növünün label-i kliklənir.
    3. Açılan 'description active' daxilindəki 'active-confirmation' checkbox-u seçilir.
    4. Məhz həmin bölmənin daxilindəki 'Add' düyməsi kliklənir.
    """
    wait = WebDriverWait(driver, 12)
    print("[~] Xidmət və razılıq addımı işlənilir...")
    
    # Səhifədəki bütün ərizəçi bloklarını (kartlarını) tapırıq
    sections = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "section-base--wrapper")))
    num_visitors = len(sections)
    
    for index in range(num_visitors):
        if index == 0:
            current_viza_novu = group_data["main_applicant"]["viza_novu"]
        else:
            current_viza_novu = group_data["additional_visitors"][index - 1]["viza_novu"]
            
        visa_option_text = "Processing a Schengen visa" if current_viza_novu == 1 else "Processing a Latvian national visa"
        print(f"[~] Ərizəçi {index + 1}/{num_visitors} növü: {visa_option_text}")
        
        # Cari ərizəçinin konteyneri
        sections = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "section-base--wrapper")))
        current_section = sections[index]
        
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", current_section)
        time.sleep(0.3)
        
        # 1. Cari kartın daxilindəki Select Service dropdown-u vururuq
        dropdown = current_section.find_element(By.CLASS_NAME, "js-services")
        driver.execute_script("arguments[0].click();", dropdown)
        time.sleep(0.6)
        
        # 2. Cari kart daxilində uyğun viza label-ini tapıb klikləyirik
        visa_labels = current_section.find_elements(By.CLASS_NAME, "text--dropdown-service")
        target_label = None
        for lbl in visa_labels:
            if visa_option_text.lower() in lbl.text.lower():
                target_label = lbl
                break
                
        if target_label:
            driver.execute_script("arguments[0].click();", target_label)
        else:
            # Əgər mətn tapılmazsa fallback olaraq birinci label
            driver.execute_script("arguments[0].click();", visa_labels[0])
            
        time.sleep(0.8)
        
        # 3. Viza seçildikdən sonra açılan aktiv acıqlama bölməsindəki 'active-confirmation' checkbox-unu seçirik
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
            print(f"[!] Razılıq checkbox-u kliklənərkən xəbərdarlıq (Ərizəçi {index + 1}): {e}")
            
        time.sleep(0.6)
        
        # 4. Məhz aktiv olan təsvir (description) bölməsindəki 'Add' düyməsini klikləyirik
        try:
            add_btn = current_section.find_element(By.XPATH, ".//button[contains(normalize-space(), 'Add') or contains(text(), 'Add')]")
            driver.execute_script("""
                arguments[0].scrollIntoView({block: 'center'});
                arguments[0].click();
                arguments[0].dispatchEvent(new Event('click', { bubbles: true }));
            """, add_btn)
            print(f"[+] Ərizəçi {index + 1} üçün xidmət uğurla əlavə edildi (Add sıxıldı).")
        except Exception as e:
            print(f"[!] Add düyməsi kliklənərkən xəta (Ərizəçi {index + 1}): {e}")
            
        time.sleep(1.2)

    # Bütün ərizəçilər tamamlandıqdan sonra növbəti mərhələyə keçid
    next_step_xpath = "//button[contains(text(), 'Next step')]"
    next_step_btn = wait.until(EC.presence_of_element_located((By.XPATH, next_step_xpath)))
    driver.execute_script("arguments[0].click();", next_step_btn)
    print("[+] Qrup üzvləri tamamlandı. Təqvimə keçilir.")
    return True


def select_time_and_finalize(driver, qrup_id, group_data, target_date):
    wait = WebDriverWait(driver, 15)
    print(f"[~] Qrup ID {qrup_id}: Saat seçmə qutusu (dropdown) gözlənilir...")
    
    try:
        select_xpath = "//select[@class='time' or contains(@name, 'visit_time')]"
        select_el = wait.until(EC.presence_of_element_located((By.XPATH, select_xpath)))
        
        dropdown = Select(select_el)
        selected_time_text = ""
        
        for option in dropdown.options:
            val = option.get_attribute("value")
            if val and val.strip():
                dropdown.select_by_value(val)
                selected_time_text = option.text.strip()
                print(f"[+] Qrup ID {qrup_id}: Avtomatik təyin edilən saat: {selected_time_text}")
                break
                
        if not selected_time_text:
            dropdown.select_by_index(0)
            
        time.sleep(0.5)
        
        next_btn_xpath = "//*[@id='step3-next-btn']//button | //div[@id='step3-next-btn']//button"
        next_btn = wait.until(EC.presence_of_element_located((By.XPATH, next_btn_xpath)))
        driver.execute_script("arguments[0].click();", next_btn)
            
        print(f"[~] Qrup ID {qrup_id}: Son təsdiq (GDPR Approve) səhifəsinin gəlməsi gözlənilir...")
        
        gdpr_cb = wait.until(EC.presence_of_element_located((By.ID, "personal-data")))
        
        for _ in range(20):
            try:
                gdpr_label = driver.find_element(By.XPATH, "//label[@for='personal-data']")
                driver.execute_script("arguments[0].click();", gdpr_label)
                break
            except:
                time.sleep(0.1)
                
        driver.execute_script("arguments[0].checked = true; arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", gdpr_cb)
        
        time.sleep(1.0)  
        
        approve_btn_xpath = "//button[contains(text(), 'Approve')] | //button[contains(normalize-space(), 'Approve')]"
        approve_btn = wait.until(EC.presence_of_element_located((By.XPATH, approve_btn_xpath)))
        driver.execute_script("arguments[0].click();", approve_btn)
                
        name = group_data["main_applicant"]["name"]
        surname = group_data["main_applicant"]["surname"]
        email = group_data["main_applicant"]["email"]
        
        success_msg = (
            f"🎉 [TEBRİKLƏR! REZERVASIYA TAMAMLANDI]\n\n"
            f"👤 Ərizəçi: {name} {surname}\n"
            f"📧 E-mail: {email}\n"
            f"📅 Tarix: {target_date}\n"
            f"⏰ Saat: {selected_time_text}\n"
            f"👥 Qrup ID: {qrup_id}\n\n"
            f"Viza yeriniz tamamilə uğurla götürüldü və təsdiqləndi! 🇱𝑽"
        )
        print(f"\n{success_msg}")
        send_tg_notification(success_msg)
        time.sleep(4)
        
    except Exception as e:
        print(f"[!] Saat seçimi və ya Yekun Təsdiq (Approve) mərhələsində kritik xəta: {e}")
        raise e  


def scan_calendar_for_2_months(driver, all_groups, scout_id):
    wait = WebDriverWait(driver, 10)
    global NOTIFIED_OUT_OF_RANGE
    
    for month_index in range(2):
        wait.until(EC.presence_of_element_located((By.ID, "calendar-daygrid")))
        clickable_days = driver.find_elements(By.XPATH, "//td[contains(@class, 'cal-active')]")
        
        for day_el in clickable_days:
            try:
                date_str = day_el.get_attribute("data-date")
                if not date_str:
                    continue
                    
                parts = [int(x) for x in date_str.split('-')]
                slot_date = datetime.date(parts[0], parts[1], parts[2])
                
                print(f"[🔥] Səhifədə aktiv gün tapıldı: {slot_date}. Excel analiz edilir...")
                
                matched_group = None
                for g_id, g_data in all_groups.items():
                    if IGNORE_EXCEL_DATES_FOR_TESTING or (g_data["tarix_baslangic"] <= slot_date <= g_data["tarix_bitis"]):
                        matched_group = (g_id, g_data)
                        break
                
                if matched_group:
                    g_id, g_data = matched_group
                    name = g_data["main_applicant"]["name"]
                    surname = g_data["main_applicant"]["surname"]
                    
                    alert_msg = (
                        f"🔥 [UYĞUN TARİX TAPILDI!]\n\n"
                        f"📅 Tarix: {slot_date}\n"
                        f"👥 Qrup ID: {g_id}\n"
                        f"👤 Ərizəçi: {name} {surname}\n\n"
                        f"Tarix Excel aralığınıza tam uyğundur! Bot dərhal yerin götürülməsinə başladı..."
                    )
                    print(alert_msg)
                    send_tg_notification(alert_msg)
                    
                    driver.execute_script("arguments[0].click();", day_el)
                        
                    if g_id == scout_id:
                        return {"action": "scout_take", "date": slot_date, "matched_group_id": g_id}
                    else:
                        return {"action": "trigger_worker", "date": slot_date, "matched_group_id": g_id}
                else:
                    if slot_date not in NOTIFIED_OUT_OF_RANGE:
                        out_msg = (
                            f"⚠️ [KƏNAR TARİX AÇILDI!]\n\n"
                            f"Təqvimdə boş yer tapıldı, lakin Excel-dəki tarix aralığınıza uyğun deyil!\n\n"
                            f"📅 Tarix: {slot_date}\n\n"
                            f"(Qeyd: Aralığa uyğun olmadığı üçün bot bu yeri götürmədi, uyğun gün üçün pusquya davam edir)."
                        )
                        print(out_msg)
                        send_tg_notification(out_msg)
                        NOTIFIED_OUT_OF_RANGE.add(slot_date)  # Anti-Spam kilidi
                        
            except Exception:
                continue

        if month_index == 0:
            try:
                next_month_btn = driver.find_element(By.XPATH, "//*[text()='>' or contains(@class, 'arrow-right') or contains(@class, 'next')]")
                driver.execute_script("arguments[0].click();", next_month_btn)
                time.sleep(1.2)
            except Exception:
                break
                
    return None


def run_worker_bot(group_data, target_date):
    trigger_key = f"{group_data['qrup_id']}_{target_date}"
    if trigger_key in ALREADY_TRIGGERED:
        return
    ALREADY_TRIGGERED.add(trigger_key)
    
    print(f"\n[🚀 İŞÇİ BOT START] Qrup {group_data['qrup_id']} fəaliyyətə başladı! Hədəf Tarix: {target_date}")
    
    w_driver = setup_driver(suffix=f"worker_{group_data['qrup_id']}")
    try:
        w_driver.get(URL)
        WebDriverWait(w_driver, 10).until(EC.presence_of_element_located((By.ID, "Persons[0][first_name]")))
        
        fill_form_for_group(w_driver, group_data)
        
        if select_service_and_consent(w_driver, group_data):
            wait = WebDriverWait(w_driver, 10)
            wait.until(EC.presence_of_element_located((By.ID, "calendar-daygrid")))
            
            target_date_str = f"{target_date.year}-{target_date.month}-{target_date.day}"
            day_xpath = f"//td[contains(@class, 'cal-active') and @data-date='{target_date_str}']"
            
            try:
                target_day_el = w_driver.find_element(By.XPATH, day_xpath)
                w_driver.execute_script("arguments[0].click();", target_day_el)
            except:
                next_month_btn = w_driver.find_element(By.XPATH, "//*[text()='>' or contains(@class, 'arrow-right') or contains(@class, 'next')]")
                w_driver.execute_script("arguments[0].click();", next_month_btn)
                time.sleep(1.2)
                target_day_el = w_driver.find_element(By.XPATH, day_xpath)
                w_driver.execute_script("arguments[0].click();", target_day_el)
                
            print(f"[🔥 UĞURLU] İşçi Bot Qrup {group_data['qrup_id']} üçün {target_date} gününü kliklədi!")
            select_time_and_finalize(w_driver, group_data['qrup_id'], group_data, target_date)
            
    except Exception as e:
        print(f"[!] İşçi Bot xətası (Qrup {group_data['qrup_id']}): {e}")
    finally:
        # Rezervasiyadan sonra brauzeri açıq saxlayırıq (ödəniş/təsdiq üçün). Lokal terminalda
        # Enter gözləyir; serverdə (PM2, terminalsız) EOFError olur → uzun sleep ilə açıq qalır.
        wait_or_pause(f"\n[İşçi Bot Qrup {group_data['qrup_id']}] Enter sıxın...")
        w_driver.quit()


def wait_or_pause(prompt, fallback_seconds=1200):
    """Lokal terminalda istifadəçidən Enter gözləyir. Serverdə (PM2 altında, stdin/terminal
    yoxdur) input() dərhal EOFError verir — bu halda botu çökdürmək əvəzinə brauzeri açıq
    saxlamaq üçün fallback_seconds qədər gözləyirik."""
    try:
        input(prompt)
    except EOFError:
        print(f"[i] Terminal yoxdur — {fallback_seconds} saniyə gözlənilir (brauzer açıq qalır)...")
        time.sleep(fallback_seconds)


def main():
    print("[*] Bot AZƏRBAYCAN CANLI REJİMİNDƏ başladıldı.")
    
    start_msg = "🚀 Bot uğurla başladıldı! Canlı təqvim pusqusu aktivdir. Səhifədə yer açılan milisaniyədə sizə dərhal xəbər veriləcək. 🎯"
    send_tg_notification(start_msg)
    
    try:
        driver = setup_driver(suffix="scout")
        print("[+] Brauzer açıldı. İlkin olaraq dərhal səhifəyə keçid edilir...")
        driver.get(URL)  
    except Exception as e:
        print(f"\n[❌ CHROME INITIALIZATION ERROR] Chrome brauzer başladıla bilmədi!")
        traceback.print_exc()
        # Fatal xəta — serverdə gözləmək mənasızdır, səliqəli çıxırıq (input() EOFError verərdi).
        try:
            input("\nÇıxmaq üçün Enter sıxın...")
        except EOFError:
            pass
        return

    attempt = 1
    try:
        while True:
            all_groups = parse_excel_groups(EXCEL_FILE)
            if not all_groups:
                print("\n[~] Növbə gözlənilir: Excel-də aktiv/oxunabilən qrup tapılmadı. 7 saniyə sonra yenidən yoxlanacaq...")
                time.sleep(7)
                continue

            group_ids = sorted(list(all_groups.keys()))
            scout_id = group_ids[0]
            scout_data = all_groups[scout_id]
            
            print(f"\n[~] Cəhd #{attempt}: Keşfiyyatçı Qrup ID {scout_id} məlumatları ilə formu doldurur...")
            
            driver.get(URL)
            time.sleep(1.0) 
                
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "Persons[0][first_name]")))
            
            try:
                fill_form_for_group(driver, scout_data)
                
                if not select_service_and_consent(driver, scout_data):
                    raise Exception("Xidmət seçimi addımı tamamlana bilmədi. Səhifə yenidən başladılacaq.")
                
                result = scan_calendar_for_2_months(driver, all_groups, scout_id)
                
                if result:
                    matched_date = result["date"]
                    matched_gid = result["matched_group_id"]
                    
                    if result["action"] == "scout_take":
                        select_time_and_finalize(driver, matched_gid, scout_data, matched_date)
                        mark_group_as_completed_in_excel(matched_gid)
                        
                        for g_id in group_ids[1:]:
                            w_data = all_groups[g_id]
                            if IGNORE_EXCEL_DATES_FOR_TESTING or (w_data["tarix_baslangic"] <= matched_date <= w_data["tarix_bitis"]):
                                mark_group_as_completed_in_excel(g_id)
                                t = threading.Thread(target=run_worker_bot, args=(w_data, matched_date))
                                t.daemon = True
                                t.start()
                        break
                        
                    elif result["action"] == "trigger_worker":
                        mark_group_as_completed_in_excel(matched_gid)
                        w_data = all_groups[matched_gid]
                        t = threading.Thread(target=run_worker_bot, args=(w_data, matched_date))
                        t.daemon = True
                        t.start()
                else:
                    print("[-] Bu ay və növbəti ayda boş yer yoxdur.")
                    
            except Exception as e:
                print(f"[!] Döngü daxili xəta: {e}")
                traceback.print_exc()
            
            clear_all_site_data(driver)
            
            print(f"[⏳] Növbəti cəhd üçün {RETRY_DELAY_SECONDS} saniyə gözlənilir...")
            time.sleep(RETRY_DELAY_SECONDS)
            attempt += 1
            
    except KeyboardInterrupt:
        print("\n[-] Sistem dayandırıldı.")
    except Exception as e:
        print(f"\n[❌ GLOBAL SYSTEM ERROR] Kritik xəta baş verdi:")
        traceback.print_exc()
    finally:
        # Yer tapılıb götürüldükdə kəşfiyyatçı brauzeri ödəniş üçün açıq qalmalıdır.
        wait_or_pause("\nKeşfiyyatçı brauzerini tam bağlamaq üçün Enter sıxın...")
        try:
            driver.quit()
        except:
            pass


if __name__ == "__main__":
    main()