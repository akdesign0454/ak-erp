function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

const MATERIALS_SUPABASE_URL = "https://gmqjbkqttkkotvvjnsiz.supabase.co";
const MATERIALS_SUPABASE_KEY = "sb_publishable_NGNO5UWtbkgCWQQ6jwTe6Q_4evcuVD9";
const ESTIMATE_SUPABASE_URL = "https://rzbqiytumnwvjlmbljbp.supabase.co";
const ESTIMATE_SUPABASE_KEY = "sb_publishable_G7L9_UDamWpmHL6r1pnqLg_7_FLUg4G";

const db = supabase.createClient(MATERIALS_SUPABASE_URL, MATERIALS_SUPABASE_KEY);
const estimateDb = supabase.createClient(ESTIMATE_SUPABASE_URL, ESTIMATE_SUPABASE_KEY);

let appInitialized = false;
let purchaseInitialized = false;
let vendorManageInitialized = false;
let materialManageInitialized = false;
let siteReportInitialized = false;
let receiptInitialized = false;
let counselConfirmedAddressRows = [];
let counselFilteredAddressRows = [];
let counselCurrentRows = [];

function submitLogin(event) {
  event.preventDefault();
  handleLogin();
  return false;
}

function enterApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
}

function leaveApp() {
  document.getElementById("appRoot").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

async function handleLogin() {
  const email = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPw").value.trim();

  if (!email || !password) {
    alert("이메일과 비밀번호를 입력하세요.");
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    alert("로그인 실패: " + error.message);
    return;
  }

  if (data.session) {
    enterApp();
    if (!appInitialized) {
      appInitialized = true;
      await showScreen("screenSiteReport");
    }
  } else {
    alert("로그인은 되었지만 세션이 확인되지 않습니다.");
  }
}

async function logout() {
  const { error } = await db.auth.signOut();
  if (error) {
    alert("로그아웃 실패: " + error.message);
    return;
  }
  appInitialized = false;
  purchaseInitialized = false;
  vendorManageInitialized = false;
  materialManageInitialized = false;
  siteReportInitialized = false;
  receiptInitialized = false;
  leaveApp();
  location.reload();
}

window.addEventListener("load", async () => {
  const { data, error } = await db.auth.getSession();
  if (error) {
    console.error(error);
    return;
  }
  if (data.session) {
    enterApp();
    if (!appInitialized) {
      appInitialized = true;
      await showScreen("screenSiteReport");
    }
  }
});

function todayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function orderNoString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `PO-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function material_makeCode(n) {
  return "item_" + String(n).padStart(5, "0");
}

function setSelectByText(selectId, text) {
  const sel = document.getElementById(selectId);
  const target = (text || "").trim();

  for (let i = 0; i < sel.options.length; i++) {
    if ((sel.options[i].text || "").trim() === target) {
      sel.selectedIndex = i;
      return;
    }
  }

  sel.value = "";
}

async function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");

  try {
    if (screenId === "screenPurchase" && !purchaseInitialized) {
      await purchase_init();
      purchaseInitialized = true;
    }
    if (screenId === "screenVendorManage" && !vendorManageInitialized) {
      await vendorManage_init();
      vendorManageInitialized = true;
    }
    if (screenId === "screenMaterialManage" && !materialManageInitialized) {
      await materialManage_init();
      materialManageInitialized = true;
    }
    if (screenId === "screenSiteReport" && !siteReportInitialized) {
      await siteReport_init();
      siteReportInitialized = true;
    }
    if (screenId === "screenReceipt" && !receiptInitialized) {
      await receipt_init();
      receiptInitialized = true;
    }
    if (screenId === "screenCounselLogs") {
      await counselLogs_refreshAddressList();
      await counselLogs_search();
    }
  } catch (e) {
    console.error(screenId + " 초기화 오류:", e);
    alert(screenId + " 초기화 오류: " + e.message);
  }
}

/* =========================
   발주서
========================= */
let purchase_orderItems = [];
let purchase_loadedOrderId = null;
let purchase_loadedMode = "new";
let purchase_currentVendorContactName = "";
let purchase_currentVendorContactPhone = "";
let purchaseEventsBound = false;

function purchase_setModeInfo() {
  const box = document.getElementById("purchase_modeInfo");
  if (purchase_loadedMode === "loaded" && purchase_loadedOrderId) {
    box.textContent = `불러온 발주 수정 모드 / 재출력 가능 / 발주ID: ${purchase_loadedOrderId}`;
  } else {
    box.textContent = "신규 작성 모드";
  }
}

function purchase_syncHeaderDisplay() {
  const vendorSelect = document.getElementById("purchase_vendor_select");
  const vendorName = vendorSelect.selectedOptions[0]?.text || "업체 미선택";
  const requesterCompany = document.getElementById("purchase_requester_company").value || "AK디자인";
  const requesterName = document.getElementById("purchase_requester_name").value || "-";
  const requesterPhone = document.getElementById("purchase_requester_phone").value || "-";
  const siteAddressSelect = document.getElementById("purchase_site_address_select");
  const siteAddress = siteAddressSelect.selectedOptions[0]?.text || "-";
  const orderDate = document.getElementById("purchase_order_date").value || "-";
  const arrivalDate = document.getElementById("purchase_arrival_date").value || "-";
  const memo = document.getElementById("purchase_memo").value || "-";

  document.getElementById("purchase_vendorNameText").textContent = vendorName;
  document.getElementById("purchase_vendorContactNameText").textContent = purchase_currentVendorContactName || "-";
  document.getElementById("purchase_vendorContactPhoneText").textContent = purchase_currentVendorContactPhone || "-";
  document.getElementById("purchase_requesterCompanyText").textContent = requesterCompany;
  document.getElementById("purchase_requesterNameText").textContent = requesterName;
  document.getElementById("purchase_requesterPhoneText").textContent = requesterPhone;
  document.getElementById("purchase_siteAddressText").textContent = siteAddress;
  document.getElementById("purchase_orderDateText").textContent = orderDate;
  document.getElementById("purchase_arrivalDateText").textContent = arrivalDate;
  document.getElementById("purchase_memoText").textContent = memo;
  document.getElementById("purchase_siteAddressLineWrap").style.display = siteAddress === "-" ? "none" : "block";
}

function purchase_clearHeaderInputs() {
  purchase_currentVendorContactName = "";
  purchase_currentVendorContactPhone = "";
  document.getElementById("purchase_order_no").value = "";
  document.getElementById("purchase_vendor_select").value = "";
  document.getElementById("purchase_requester_company").value = "AK디자인";
  document.getElementById("purchase_requester_name_select").value = "";
  document.getElementById("purchase_requester_name").value = "";
  document.getElementById("purchase_requester_phone").value = "";
  document.getElementById("purchase_site_address_select").value = "";
  document.getElementById("purchase_order_date").value = todayString();
  document.getElementById("purchase_arrival_date").value = "";
  document.getElementById("purchase_memo").value = "";
  purchase_syncHeaderDisplay();
}

function purchase_clearSearchInputs() {
  document.getElementById("purchase_search_order_no").value = "";
  document.getElementById("purchase_search_vendor_name").value = "";
  document.getElementById("purchase_search_site_name").value = "";
}

function purchase_newOrder() {
  purchase_loadedOrderId = null;
  purchase_loadedMode = "new";
  purchase_orderItems = [];
  purchase_clearHeaderInputs();
  document.getElementById("purchase_order_no").value = orderNoString();
  purchase_renderOrderItems();
  document.getElementById("purchase_materialBody").innerHTML = "";
  purchase_setModeInfo();
  purchase_syncHeaderDisplay();
}

async function purchase_loadVendors() {
  const { data, error } = await db.from("vendors").select("*").order("vendor_name", { ascending: true });
  if (error) throw new Error("업체 불러오기 실패: " + error.message);
  const sel = document.getElementById("purchase_vendor_select");
  sel.innerHTML = '<option value="">업체 선택</option>';
  data.forEach(v => {
    sel.innerHTML += `<option value="${v.id}">${v.vendor_name}</option>`;
  });
}

async function purchase_loadRequesterContacts() {
  const { data, error } = await db
    .from("requester_contacts")
    .select("*")
    .eq("company_name", "AK디자인")
    .eq("is_active", true)
    .order("contact_name", { ascending: true });

  if (error) throw new Error("발주처 담당자 불러오기 실패: " + error.message);

  const sel = document.getElementById("purchase_requester_name_select");
  sel.innerHTML = '<option value="">담당자 선택</option>';
  data.forEach(row => {
    sel.innerHTML += `<option value="${row.id}" data-phone="${row.contact_phone}">${row.contact_name}</option>`;
  });
}

async function purchase_loadSiteAddresses() {
  await syncConfirmedEstimateAddressesToSiteDb();
  const { data, error } = await db
    .from("site_addresses")
    .select("*")
    .eq("is_active", true)
    .order("site_address", { ascending: true });

  if (error) throw new Error("현장주소 불러오기 실패: " + error.message);

  const sel = document.getElementById("purchase_site_address_select");
  const currentText = sel.selectedOptions[0]?.text || "";
  sel.innerHTML = '<option value="">현장주소 선택</option>';

  data.forEach(row => {
    sel.innerHTML += `<option value="${row.id}">${row.site_address}</option>`;
  });

  if (currentText) setSelectByText("purchase_site_address_select", currentText);
}

function purchase_fillRequesterPhoneFromSelect() {
  const sel = document.getElementById("purchase_requester_name_select");
  const option = sel.selectedOptions[0];
  if (!option || !sel.value) {
    document.getElementById("purchase_requester_name").value = "";
    document.getElementById("purchase_requester_phone").value = "";
    purchase_syncHeaderDisplay();
    return;
  }
  document.getElementById("purchase_requester_name").value = option.textContent || "";
  document.getElementById("purchase_requester_phone").value = option.getAttribute("data-phone") || "";
  purchase_syncHeaderDisplay();
}

async function purchase_loadVendorMaterials() {
  const vendorId = document.getElementById("purchase_vendor_select").value;
  const body = document.getElementById("purchase_materialBody");
  body.innerHTML = "";

  purchase_currentVendorContactName = "";
  purchase_currentVendorContactPhone = "";
  purchase_syncHeaderDisplay();

  if (!vendorId) return;

  const { data: vendorRow, error: vendorError } = await db
    .from("vendors")
    .select("vendor_contact_name, vendor_contact_phone")
    .eq("id", vendorId)
    .single();

  if (vendorError) throw new Error("업체 담당자 조회 실패: " + vendorError.message);

  purchase_currentVendorContactName = vendorRow.vendor_contact_name || "";
  purchase_currentVendorContactPhone = vendorRow.vendor_contact_phone || "";

  const { data, error } = await db
    .from("materials")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("item_name", { ascending: true });

  if (error) throw new Error("자재 불러오기 실패: " + error.message);

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.item_name ?? ""}</td>
      <td>${row.unit ?? ""}</td>
      <td>${row.stock_qty ?? 0}</td>
    `;
    tr.onclick = () => purchase_addOrderItem(row);
    body.appendChild(tr);
  });

  purchase_syncHeaderDisplay();
}

function purchase_addOrderItem(row) {
  const foundIndex = purchase_orderItems.findIndex(x => x.material_id === row.id);
  if (foundIndex >= 0) {
    purchase_orderItems[foundIndex].order_qty += 1;
  } else {
    purchase_orderItems.push({
      material_id: row.id,
      item_name_snapshot: row.item_name ?? "",
      unit_snapshot: row.unit ?? "",
      order_qty: 1
    });
  }
  purchase_renderOrderItems();
}

function purchase_removeOrderItem(index) {
  purchase_orderItems.splice(index, 1);
  purchase_renderOrderItems();
}

function purchase_updateQty(index, value) {
  const qty = Number(value || 0);
  purchase_orderItems[index].order_qty = qty < 0 ? 0 : qty;
}

function purchase_renderOrderItems() {
  const body = document.getElementById("purchase_orderItemBody");
  body.innerHTML = "";

  purchase_orderItems.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.item_name_snapshot ?? ""}</td>
      <td>${row.unit_snapshot ?? ""}</td>
      <td>
        <input class="table-input" type="number" min="0" value="${row.order_qty ?? 0}"
          oninput="purchase_updateQty(${index}, this.value)">
      </td>
      <td class="no-print">
        <button class="danger-btn" onclick="purchase_removeOrderItem(${index})">삭제</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

function purchase_getHeaderFormData() {
  const vendorSelect = document.getElementById("purchase_vendor_select");
  return {
    order_no: document.getElementById("purchase_order_no").value.trim(),
    vendor_id: vendorSelect.value || null,
    vendor_name: vendorSelect.selectedOptions[0]?.text || "",
    vendor_contact_name: purchase_currentVendorContactName || "",
    vendor_contact_phone: purchase_currentVendorContactPhone || "",
    requester_company: "AK디자인",
    requester_name: document.getElementById("purchase_requester_name").value.trim(),
    requester_phone: document.getElementById("purchase_requester_phone").value.trim(),
    site_name: "",
    site_address: document.getElementById("purchase_site_address_select").selectedOptions[0]?.text || "",
    order_date: document.getElementById("purchase_order_date").value,
    arrival_date: document.getElementById("purchase_arrival_date").value,
    memo: document.getElementById("purchase_memo").value.trim()
  };
}

function purchase_validateOrderData(formData) {
  if (!formData.order_no) return alert("발주번호를 먼저 생성하세요."), false;
  if (!formData.vendor_id) return alert("업체를 선택하세요."), false;
  if (!formData.requester_name || !formData.requester_phone) return alert("발주처 담당자와 전화번호를 입력하세요."), false;
  if (!formData.site_address) return alert("현장주소를 선택하세요."), false;
  if (purchase_orderItems.length === 0) return alert("발주 항목을 한 개 이상 추가하세요."), false;
  const validItems = purchase_orderItems.filter(x => Number(x.order_qty) > 0);
  if (validItems.length === 0) return alert("수량이 0보다 큰 항목이 필요합니다."), false;
  return true;
}

async function purchase_saveOrder() {
  const formData = purchase_getHeaderFormData();
  if (!purchase_validateOrderData(formData)) return;

  if (purchase_loadedMode === "loaded") {
    alert("현재 불러온 발주입니다. 신규 저장이 아니라 수정 저장을 사용하세요.");
    return;
  }

  const validItems = purchase_orderItems.filter(x => Number(x.order_qty) > 0);

  const { data: orderData, error: orderError } = await db
    .from("purchase_lists")
    .insert([{ ...formData, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (orderError) {
    alert("발주 저장 실패: " + orderError.message);
    return;
  }

  const itemRows = validItems.map(x => ({
    purchase_list_id: orderData.id,
    material_id: x.material_id,
    item_name_snapshot: x.item_name_snapshot,
    unit_snapshot: x.unit_snapshot,
    order_qty: x.order_qty,
    updated_at: new Date().toISOString()
  }));

  const { error: itemError } = await db.from("purchase_list_items").insert(itemRows);
  if (itemError) {
    alert("발주 상세 저장 실패: " + itemError.message);
    return;
  }

  alert("발주 저장 완료");
  purchase_loadedOrderId = orderData.id;
  purchase_loadedMode = "loaded";
  purchase_setModeInfo();
}

async function purchase_updateOrder() {
  if (!purchase_loadedOrderId) {
    alert("먼저 조회해서 불러온 발주만 수정 저장할 수 있습니다.");
    return;
  }

  const confirmResult = confirm("정말 수정 저장하시겠습니까?\n기존 발주 상세내역은 현재 화면 내용으로 교체됩니다.");
  if (!confirmResult) return;

  const formData = purchase_getHeaderFormData();
  if (!purchase_validateOrderData(formData)) return;

  const validItems = purchase_orderItems.filter(x => Number(x.order_qty) > 0);

  const { error: headerError } = await db
    .from("purchase_lists")
    .update({ ...formData, updated_at: new Date().toISOString() })
    .eq("id", purchase_loadedOrderId);

  if (headerError) {
    alert("발주 헤더 수정 실패: " + headerError.message);
    return;
  }

  const { error: deleteError } = await db
    .from("purchase_list_items")
    .delete()
    .eq("purchase_list_id", purchase_loadedOrderId);

  if (deleteError) {
    alert("기존 발주 상세 삭제 실패: " + deleteError.message);
    return;
  }

  const itemRows = validItems.map(x => ({
    purchase_list_id: purchase_loadedOrderId,
    material_id: x.material_id,
    item_name_snapshot: x.item_name_snapshot,
    unit_snapshot: x.unit_snapshot,
    order_qty: x.order_qty,
    updated_at: new Date().toISOString()
  }));

  const { error: insertError } = await db.from("purchase_list_items").insert(itemRows);
  if (insertError) {
    alert("수정 상세 저장 실패: " + insertError.message);
    return;
  }

  alert("수정 저장 완료");
}

async function purchase_searchOrders() {
  const searchOrderNo = document.getElementById("purchase_search_order_no").value.trim();
  const searchVendorName = document.getElementById("purchase_search_vendor_name").value.trim();
  const searchSiteName = document.getElementById("purchase_search_site_name").value.trim();

  let query = db.from("purchase_lists").select("*").order("created_at", { ascending: false }).limit(100);
  if (searchOrderNo) query = query.ilike("order_no", `%${searchOrderNo}%`);
  if (searchVendorName) query = query.ilike("vendor_name", `%${searchVendorName}%`);
  if (searchSiteName) query = query.ilike("site_address", `%${searchSiteName}%`);

  const { data, error } = await query;
  if (error) {
    alert("발주 조회 실패: " + error.message);
    return;
  }

  purchase_renderSearchOrders(data || []);
}

function purchase_renderSearchOrders(rows) {
  const body = document.getElementById("purchase_orderSearchBody");
  body.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.order_no ?? ""}</td>
      <td>${row.vendor_name ?? ""}</td>
      <td>${row.site_address ?? row.site_name ?? ""}</td>
      <td>${row.order_date ?? ""}</td>
      <td>${row.arrival_date ?? ""}</td>
    `;
    tr.onclick = () => purchase_loadOrderDetail(row.id);
    body.appendChild(tr);
  });
}

async function purchase_loadOrderDetail(orderId) {
  const { data: header, error: headerError } = await db
    .from("purchase_lists")
    .select("*")
    .eq("id", orderId)
    .single();

  if (headerError) {
    alert("발주 헤더 불러오기 실패: " + headerError.message);
    return;
  }

  const { data: items, error: itemsError } = await db
    .from("purchase_list_items")
    .select("*")
    .eq("purchase_list_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    alert("발주 상세 불러오기 실패: " + itemsError.message);
    return;
  }

  purchase_loadedOrderId = header.id;
  purchase_loadedMode = "loaded";
  purchase_currentVendorContactName = header.vendor_contact_name || "";
  purchase_currentVendorContactPhone = header.vendor_contact_phone || "";

  document.getElementById("purchase_order_no").value = header.order_no ?? "";
  document.getElementById("purchase_vendor_select").value = header.vendor_id ?? "";
  document.getElementById("purchase_requester_company").value = header.requester_company ?? "AK디자인";
  document.getElementById("purchase_requester_name").value = header.requester_name ?? "";
  document.getElementById("purchase_requester_phone").value = header.requester_phone ?? "";
  await purchase_loadSiteAddresses();
  setSelectByText("purchase_site_address_select", header.site_address ?? "");
  document.getElementById("purchase_order_date").value = header.order_date ?? "";
  document.getElementById("purchase_arrival_date").value = header.arrival_date ?? "";
  document.getElementById("purchase_memo").value = header.memo ?? "";

  purchase_orderItems = (items || []).map(x => ({
    material_id: x.material_id,
    item_name_snapshot: x.item_name_snapshot ?? "",
    unit_snapshot: x.unit_snapshot ?? "",
    order_qty: Number(x.order_qty || 0)
  }));

  purchase_renderOrderItems();
  purchase_setModeInfo();
  await purchase_loadVendorMaterials();
  purchase_currentVendorContactName = header.vendor_contact_name || purchase_currentVendorContactName;
  purchase_currentVendorContactPhone = header.vendor_contact_phone || purchase_currentVendorContactPhone;
  purchase_syncHeaderDisplay();

  alert("발주 상세 불러오기 완료");
}

async function purchase_init() {
  await purchase_loadVendors();
  await purchase_loadRequesterContacts();
  await purchase_loadSiteAddresses();
  purchase_newOrder();

  if (!purchaseEventsBound) {
    document.getElementById("purchase_vendor_select").addEventListener("change", async () => {
      await purchase_loadVendorMaterials();
      purchase_syncHeaderDisplay();
    });
    document.getElementById("purchase_requester_name_select").addEventListener("change", purchase_fillRequesterPhoneFromSelect);
    document.getElementById("purchase_requester_name").addEventListener("input", purchase_syncHeaderDisplay);
    document.getElementById("purchase_requester_phone").addEventListener("input", purchase_syncHeaderDisplay);
    document.getElementById("purchase_site_address_select").addEventListener("change", purchase_syncHeaderDisplay);
    document.getElementById("purchase_order_date").addEventListener("input", purchase_syncHeaderDisplay);
    document.getElementById("purchase_arrival_date").addEventListener("input", purchase_syncHeaderDisplay);
    document.getElementById("purchase_memo").addEventListener("input", purchase_syncHeaderDisplay);
    purchaseEventsBound = true;
  }

  purchase_setModeInfo();
  purchase_syncHeaderDisplay();
}

/* =========================
   업체/자재 관리
========================= */
let material_selectedMaterial = null;
let material_selectedVendorManageId = null;
let material_selectedRequesterId = null;

async function material_loadRequesterList() {
  const { data, error } = await db
    .from("requester_contacts")
    .select("*")
    .eq("company_name", "AK디자인")
    .eq("is_active", true)
    .order("contact_name", { ascending: true });

  if (error) throw new Error("발주처 담당자 불러오기 실패: " + error.message);

  const sel = document.getElementById("material_requester_manage_select");
  sel.innerHTML = '<option value="">담당자 선택</option>';
  data.forEach(r => {
    sel.innerHTML += `<option value="${r.id}">${r.contact_name}</option>`;
  });
}

function material_resetRequesterForm() {
  material_selectedRequesterId = null;
  document.getElementById("material_requester_manage_select").value = "";
  document.getElementById("material_requester_contact_name").value = "";
  document.getElementById("material_requester_contact_phone").value = "";
}

async function material_loadRequesterToForm() {
  const id = document.getElementById("material_requester_manage_select").value;
  material_selectedRequesterId = id || null;
  if (!id) {
    material_resetRequesterForm();
    return;
  }

  const { data, error } = await db
    .from("requester_contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert("발주처 담당자 조회 실패: " + error.message);
    return;
  }

  material_selectedRequesterId = data.id;
  document.getElementById("material_requester_contact_name").value = data.contact_name || "";
  document.getElementById("material_requester_contact_phone").value = data.contact_phone || "";
}

async function material_saveRequesterContact() {
  const contact_name = document.getElementById("material_requester_contact_name").value.trim();
  const contact_phone = document.getElementById("material_requester_contact_phone").value.trim();

  if (!contact_name || !contact_phone) {
    alert("발주처 담당자명과 전화번호를 입력하세요.");
    return;
  }

  const { error } = await db
    .from("requester_contacts")
    .insert([{
      company_name: "AK디자인",
      contact_name,
      contact_phone,
      is_active: true
    }]);

  if (error) {
    alert("발주처 담당자 저장 실패: " + error.message);
    return;
  }

  alert("발주처 담당자 저장 완료");
  await material_loadRequesterList();
  if (purchaseInitialized) await purchase_loadRequesterContacts();
  material_resetRequesterForm();
}

async function material_updateRequesterContact() {
  const contact_name = document.getElementById("material_requester_contact_name").value.trim();
  const contact_phone = document.getElementById("material_requester_contact_phone").value.trim();

  if (!contact_name || !contact_phone) {
    alert("발주처 담당자명과 전화번호를 입력하세요.");
    return;
  }

  let targetId = material_selectedRequesterId;

  if (!targetId) {
    const { data: foundRows, error: findError } = await db
      .from("requester_contacts")
      .select("id, contact_name")
      .eq("company_name", "AK디자인")
      .eq("contact_name", contact_name)
      .eq("is_active", true);

    if (findError) {
      alert("수정 대상 조회 실패: " + findError.message);
      return;
    }
    if (!foundRows || foundRows.length === 0) {
      alert("수정할 기존 발주처 담당자를 찾지 못했습니다.");
      return;
    }
    if (foundRows.length > 1) {
      alert("같은 담당자명이 여러 개 있습니다. 드롭다운에서 먼저 선택하세요.");
      return;
    }
    targetId = foundRows[0].id;
  }

  if (!confirm("선택한 발주처 담당자 정보를 수정 저장하시겠습니까?")) return;

  const { error } = await db
    .from("requester_contacts")
    .update({ contact_name, contact_phone })
    .eq("id", targetId);

  if (error) {
    alert("발주처 담당자 수정 실패: " + error.message);
    return;
  }

  alert("발주처 담당자 수정 완료");
  await material_loadRequesterList();
  if (purchaseInitialized) await purchase_loadRequesterContacts();
  document.getElementById("material_requester_manage_select").value = targetId;
  material_selectedRequesterId = targetId;
  await material_loadRequesterToForm();
}

async function material_loadVendor() {
  const { data, error } = await db
    .from("vendors")
    .select("*")
    .order("vendor_name", { ascending: true });

  if (error) throw new Error("업체 불러오기 실패: " + error.message);

  const sel1 = document.getElementById("material_vendor_select");
  const sel2 = document.getElementById("material_vendor_manage_select");

  sel1.innerHTML = '<option value="">업체 선택</option>';
  sel2.innerHTML = '<option value="">업체 선택</option>';

  data.forEach(v => {
    sel1.innerHTML += `<option value="${v.id}">${v.vendor_name}</option>`;
    sel2.innerHTML += `<option value="${v.id}">${v.vendor_name}</option>`;
  });

  if (purchaseInitialized) {
    const purchaseSel = document.getElementById("purchase_vendor_select");
    const currentValue = purchaseSel.value;
    purchaseSel.innerHTML = '<option value="">업체 선택</option>';
    data.forEach(v => {
      purchaseSel.innerHTML += `<option value="${v.id}">${v.vendor_name}</option>`;
    });
    if (currentValue) purchaseSel.value = currentValue;
  }
}

function material_resetVendorForm() {
  material_selectedVendorManageId = null;
  document.getElementById("material_vendor_manage_select").value = "";
  document.getElementById("material_vendor_name").value = "";
  document.getElementById("material_vendor_contact_name").value = "";
  document.getElementById("material_vendor_contact_phone").value = "";
}

async function material_loadVendorToForm() {
  const id = document.getElementById("material_vendor_manage_select").value;
  material_selectedVendorManageId = id || null;

  if (!id) {
    material_resetVendorForm();
    return;
  }

  const { data, error } = await db
    .from("vendors")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    alert("업체 조회 실패: " + error.message);
    return;
  }

  material_selectedVendorManageId = data.id;
  document.getElementById("material_vendor_name").value = data.vendor_name || "";
  document.getElementById("material_vendor_contact_name").value = data.vendor_contact_name || "";
  document.getElementById("material_vendor_contact_phone").value = data.vendor_contact_phone || "";
}

async function material_saveVendor() {
  const vendor_name = document.getElementById("material_vendor_name").value.trim();
  const vendor_contact_name = document.getElementById("material_vendor_contact_name").value.trim();
  const vendor_contact_phone = document.getElementById("material_vendor_contact_phone").value.trim();

  if (!vendor_name) {
    alert("업체명을 입력하세요.");
    return;
  }

  const { error } = await db
    .from("vendors")
    .insert([{ vendor_name, vendor_contact_name, vendor_contact_phone }]);

  if (error) {
    alert("업체 저장 실패: " + error.message);
    return;
  }

  alert("업체 저장 완료");
  await material_loadVendor();
  material_resetVendorForm();
}

async function material_updateVendor() {
  const vendor_name = document.getElementById("material_vendor_name").value.trim();
  const vendor_contact_name = document.getElementById("material_vendor_contact_name").value.trim();
  const vendor_contact_phone = document.getElementById("material_vendor_contact_phone").value.trim();

  if (!vendor_name) {
    alert("업체명을 입력하세요.");
    return;
  }

  let targetId = material_selectedVendorManageId;

  if (!targetId) {
    const { data: foundRows, error: findError } = await db
      .from("vendors")
      .select("id, vendor_name")
      .eq("vendor_name", vendor_name);

    if (findError) {
      alert("수정 대상 조회 실패: " + findError.message);
      return;
    }
    if (!foundRows || foundRows.length === 0) {
      alert("수정할 기존 업체를 찾지 못했습니다.");
      return;
    }
    if (foundRows.length > 1) {
      alert("같은 업체명이 여러 개 있습니다. 드롭다운에서 먼저 선택하세요.");
      return;
    }
    targetId = foundRows[0].id;
  }

  if (!confirm("선택한 업체 정보를 수정 저장하시겠습니까?")) return;

  const { error } = await db
    .from("vendors")
    .update({ vendor_name, vendor_contact_name, vendor_contact_phone })
    .eq("id", targetId);

  if (error) {
    alert("업체 수정 실패: " + error.message);
    return;
  }

  alert("업체 수정 완료");
  await material_loadVendor();
  document.getElementById("material_vendor_manage_select").value = targetId;
  material_selectedVendorManageId = targetId;
  await material_loadVendorToForm();
}

async function material_getNextCode() {
  const { data, error } = await db
    .from("materials")
    .select("item_code")
    .order("item_code", { ascending: false })
    .limit(1);

  if (error) {
    alert("자재코드 조회 실패: " + error.message);
    return "item_00001";
  }

  if (!data || !data.length) return "item_00001";

  const lastCode = data[0].item_code || "item_00000";
  const num = parseInt(lastCode.replace("item_", "")) + 1;
  return material_makeCode(num);
}

async function material_saveMaterial() {
  const vendor_id = document.getElementById("material_vendor_select").value;
  const item_code = await material_getNextCode();
  const item_name = document.getElementById("material_item_name").value.trim();
  const spec = document.getElementById("material_spec").value.trim();
  const unit = document.getElementById("material_unit").value.trim();
  const note = document.getElementById("material_note").value.trim();

  if (!vendor_id) {
    alert("업체를 선택하세요.");
    return;
  }
  if (!item_name) {
    alert("자재명을 입력하세요.");
    return;
  }

  const { error } = await db
    .from("materials")
    .insert([{ vendor_id, item_code, item_name, spec, unit, stock_qty: 0, note }]);

  if (error) {
    alert("자재 저장 실패: " + error.message);
    return;
  }

  alert("자재 저장 완료");
  await material_loadMaterials();
  if (purchaseInitialized && document.getElementById("purchase_vendor_select").value === vendor_id) {
    await purchase_loadVendorMaterials();
  }
  await material_resetMaterialForm();
}

async function material_updateMaterial() {
  if (!material_selectedMaterial) {
    alert("수정할 자재를 먼저 선택하세요.");
    return;
  }

  const vendor_id = document.getElementById("material_vendor_select").value;
  const item_name = document.getElementById("material_item_name").value.trim();
  const spec = document.getElementById("material_spec").value.trim();
  const unit = document.getElementById("material_unit").value.trim();
  const note = document.getElementById("material_note").value.trim();

  if (!vendor_id) {
    alert("업체를 선택하세요.");
    return;
  }
  if (!item_name) {
    alert("자재명을 입력하세요.");
    return;
  }

  const { error } = await db
    .from("materials")
    .update({ vendor_id, item_name, spec, unit, note })
    .eq("id", material_selectedMaterial.id);

  if (error) {
    alert("자재 수정 실패: " + error.message);
    return;
  }

  alert("자재 수정 완료");
  await material_loadMaterials();
  if (purchaseInitialized && document.getElementById("purchase_vendor_select").value) {
    await purchase_loadVendorMaterials();
  }
}

function material_selectMaterialRow(r) {
  material_selectedMaterial = r;
  document.getElementById("material_vendor_select").value = r.vendor_id || "";
  document.getElementById("material_item_code").value = r.item_code || "";
  document.getElementById("material_item_name").value = r.item_name || "";
  document.getElementById("material_spec").value = r.spec || "";
  document.getElementById("material_unit").value = r.unit || "";
  document.getElementById("material_stock_qty").value = r.stock_qty || 0;
  document.getElementById("material_note").value = r.note || "";
}

async function material_changeStock() {
  if (!material_selectedMaterial) {
    alert("자재를 먼저 선택하세요.");
    return;
  }

  const type = document.getElementById("material_type").value;
  const qty = Number(document.getElementById("material_qty").value || 0);

  if (qty < 0) {
    alert("수량은 0 이상이어야 합니다.");
    return;
  }

  let stock = Number(material_selectedMaterial.stock_qty || 0);
  if (type === "IN") stock += qty;
  if (type === "OUT") stock -= qty;
  if (type === "ADJUST") stock = qty;

  const { error } = await db
    .from("materials")
    .update({ stock_qty: stock })
    .eq("id", material_selectedMaterial.id);

  if (error) {
    alert("재고 반영 실패: " + error.message);
    return;
  }

  alert("재고 반영 완료");
  await material_loadMaterials();
  if (purchaseInitialized && document.getElementById("purchase_vendor_select").value) {
    await purchase_loadVendorMaterials();
  }
}

async function material_loadMaterials() {
  const { data, error } = await db
    .from("materials")
    .select("*, vendors(vendor_name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("목록 불러오기 실패: " + error.message);

  const body = document.getElementById("material_body");
  body.innerHTML = "";

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.vendors?.vendor_name || ""}</td>
      <td>${r.item_code || ""}</td>
      <td>${r.item_name || ""}</td>
      <td>${r.spec || ""}</td>
      <td>${r.unit || ""}</td>
      <td>${r.stock_qty || 0}</td>
    `;
    tr.onclick = () => material_selectMaterialRow(r);
    body.appendChild(tr);
  });
}

async function material_resetMaterialForm() {
  material_selectedMaterial = null;
  document.getElementById("material_vendor_select").value = "";
  document.getElementById("material_item_code").value = await material_getNextCode();
  document.getElementById("material_item_name").value = "";
  document.getElementById("material_spec").value = "";
  document.getElementById("material_unit").value = "";
  document.getElementById("material_stock_qty").value = "";
  document.getElementById("material_note").value = "";
}

async function vendorManage_init() {
  await material_loadVendor();
  material_resetVendorForm();
}

async function materialManage_init() {
  await material_loadVendor();
  await material_loadMaterials();
  await material_resetMaterialForm();
}


/* =========================
   현장 관리 보고
========================= */
let siteReport_selectedId = null;

async function siteReport_loadSiteOptions() {
  await syncConfirmedEstimateAddressesToSiteDb();
  const { data, error } = await db
    .from("site_addresses")
    .select("*")
    .eq("is_active", true)
    .order("site_address", { ascending: true });

  if (error) throw new Error("현장주소 옵션 불러오기 실패: " + error.message);

  const editSel = document.getElementById("site_report_site_select");
  const searchSel = document.getElementById("site_report_search_site_select");
  const currentEditText = editSel.selectedOptions[0]?.text || "";
  const currentSearchText = searchSel.selectedOptions[0]?.text || "";

  editSel.innerHTML = '<option value="">현장주소 선택</option>';
  searchSel.innerHTML = '<option value="">전체 현장</option>';

  data.forEach(row => {
    editSel.innerHTML += `<option value="${row.id}">${row.site_address}</option>`;
    searchSel.innerHTML += `<option value="${row.id}">${row.site_address}</option>`;
  });

  if (currentEditText) setSelectByText("site_report_site_select", currentEditText);
  if (currentSearchText) setSelectByText("site_report_search_site_select", currentSearchText);
}

function siteReport_defaultContent() {
  return "오늘 마감보고서 :\n\n내일 진행할 보고서 :";
}

function siteReport_resetForm() {
  siteReport_selectedId = null;
  document.getElementById("site_report_id").value = "";
  document.getElementById("site_report_date").value = todayString();
  document.getElementById("site_report_site_select").value = "";
  const box = document.getElementById("site_report_content");
  box.value = siteReport_defaultContent();
  autoResize(box);
}

function siteReport_clearSearch() {
  document.getElementById("site_report_search_date").value = "";
  document.getElementById("site_report_search_site_select").value = "";
  siteReport_search();
}

async function siteReport_save() {
  const report_date = document.getElementById("site_report_date").value;
  const site_address_id = document.getElementById("site_report_site_select").value;
  const report_content = document.getElementById("site_report_content").value.trim();

  if (!report_date) {
    alert("일자를 선택하세요.");
    return;
  }
  if (!site_address_id) {
    alert("현장주소를 선택하세요.");
    return;
  }
  if (!report_content) {
    alert("현장 내용을 입력하세요.");
    return;
  }

  const { data: found, error: findError } = await db
    .from("site_reports")
    .select("*")
    .eq("report_date", report_date)
    .eq("site_address_id", site_address_id)
    .maybeSingle();

  if (findError) {
    alert("기존 보고 조회 실패: " + findError.message);
    return;
  }

  if (found) {
    alert("같은 날짜와 같은 현장주소의 보고가 이미 있습니다.\n수정 버튼을 사용하세요.");
    siteReport_selectedId = found.id;
    document.getElementById("site_report_id").value = found.id;
    document.getElementById("site_report_content").value = found.report_content || "";
    return;
  }

  const { error } = await db
    .from("site_reports")
    .insert([{
      report_date,
      site_address_id,
      report_content,
      updated_at: new Date().toISOString()
    }]);

  if (error) {
    alert("현장 보고 저장 실패: " + error.message);
    return;
  }

  alert("현장 보고 저장 완료");
  await siteReport_search();
  siteReport_resetForm();
}

async function siteReport_update() {
  if (!siteReport_selectedId) {
    alert("먼저 조회 목록에서 수정할 보고를 선택하세요.");
    return;
  }

  const report_date = document.getElementById("site_report_date").value;
  const site_address_id = document.getElementById("site_report_site_select").value;
  const report_content = document.getElementById("site_report_content").value.trim();

  if (!report_date) {
    alert("일자를 선택하세요.");
    return;
  }
  if (!site_address_id) {
    alert("현장주소를 선택하세요.");
    return;
  }
  if (!report_content) {
    alert("현장 내용을 입력하세요.");
    return;
  }

  if (!confirm("선택한 현장 보고를 수정 저장하시겠습니까?")) return;

  const { data: dup, error: dupError } = await db
    .from("site_reports")
    .select("id")
    .eq("report_date", report_date)
    .eq("site_address_id", site_address_id)
    .neq("id", siteReport_selectedId)
    .maybeSingle();

  if (dupError) {
    alert("중복 확인 실패: " + dupError.message);
    return;
  }

  if (dup) {
    alert("같은 날짜와 같은 현장주소의 다른 보고가 이미 있습니다.");
    return;
  }

  const { error } = await db
    .from("site_reports")
    .update({
      report_date,
      site_address_id,
      report_content,
      updated_at: new Date().toISOString()
    })
    .eq("id", siteReport_selectedId);

  if (error) {
    alert("현장 보고 수정 실패: " + error.message);
    return;
  }

  alert("현장 보고 수정 완료");
  await siteReport_search();
}

async function siteReport_search() {
  const searchDate = document.getElementById("site_report_search_date").value;
  const searchSiteId = document.getElementById("site_report_search_site_select").value;

  let query = db
    .from("site_reports")
    .select("*, site_addresses(site_address)")
    .order("report_date", { ascending: false })
    .order("id", { ascending: false });

  if (searchDate) query = query.eq("report_date", searchDate);
  if (searchSiteId) query = query.eq("site_address_id", searchSiteId);

  const { data, error } = await query;

  if (error) {
    alert("현장 보고 조회 실패: " + error.message);
    return;
  }

  const body = document.getElementById("site_report_body");
  body.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.report_date ?? ""}</td>
      <td>${row.site_addresses?.site_address ?? ""}</td>
      <td style="white-space:normal;min-width:300px;">${(row.report_content ?? "").replace(/\n/g, "<br>")}</td>
    `;
    tr.onclick = () => siteReport_loadDetail(row);
    body.appendChild(tr);
  });
}

function siteReport_loadDetail(row) {
  siteReport_selectedId = row.id;
  document.getElementById("site_report_id").value = row.id;
  document.getElementById("site_report_date").value = row.report_date || "";
  const box = document.getElementById("site_report_content");
  box.value = row.report_content || siteReport_defaultContent();
  autoResize(box);

  const siteText = row.site_addresses?.site_address || "";
  setSelectByText("site_report_site_select", siteText);
}

async function siteReport_init() {
  await siteReport_loadSiteOptions();
  siteReport_resetForm();
  await siteReport_search();
}

/* =========================
   입고 처리
========================= */
let receipt_selectedId = null;
let receipt_selectedHeader = null;
let receipt_items = [];

async function receipt_loadRecent() {
  const { data, error } = await db
    .from("purchase_lists")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error("최근 발주 조회 실패: " + error.message);

  const body = document.getElementById("receipt_orderBody");
  body.innerHTML = "";

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.order_no ?? ""}</td>
      <td>${r.vendor_name ?? ""}</td>
      <td>${r.order_date ?? ""}</td>
    `;
    tr.onclick = () => {
      document.querySelectorAll("#receipt_orderBody tr").forEach(x => x.classList.remove("selected"));
      tr.classList.add("selected");
      receipt_selectedId = r.id;
      receipt_selectedHeader = r;
    };
    body.appendChild(tr);
  });
}

async function receipt_loadSelected() {
  if (!receipt_selectedId) {
    alert("발주를 먼저 선택하세요.");
    return;
  }

  document.getElementById("receipt_selected_order_no").value = receipt_selectedHeader?.order_no ?? "";
  document.getElementById("receipt_selected_vendor_name").value = receipt_selectedHeader?.vendor_name ?? "";
  document.getElementById("receipt_selected_order_date").value = receipt_selectedHeader?.order_date ?? "";

  const { data, error } = await db
    .from("purchase_list_items")
    .select("*")
    .eq("purchase_list_id", receipt_selectedId)
    .order("created_at", { ascending: true });

  if (error) {
    alert("발주 상세 조회 실패: " + error.message);
    return;
  }

  receipt_items = [];

  for (const row of data) {
    let currentStock = 0;

    if (row.material_id) {
      const { data: matData } = await db
        .from("materials")
        .select("stock_qty")
        .eq("id", row.material_id)
        .maybeSingle();

      currentStock = Number(matData?.stock_qty || 0);
    }

    const orderQty = Number(row.order_qty || 0);
    const receiptQty = Number(row.receipt_qty || 0);
    const remainQty = Math.max(orderQty - receiptQty, 0);
    const done = row.receipt_done || remainQty === 0;

    receipt_items.push({
      id: row.id,
      material_id: row.material_id,
      item_name_snapshot: row.item_name_snapshot ?? "",
      order_qty: orderQty,
      receipt_qty: receiptQty,
      remain_qty: remainQty,
      current_stock: currentStock,
      receive_qty: 0,
      receipt_done: done
    });
  }

  receipt_render();
}

function receipt_render() {
  const body = document.getElementById("receipt_itemBody");
  body.innerHTML = "";

  receipt_items.forEach((r, i) => {
    const statusText = r.receipt_done ? "입고완료" : "입고대기";
    const statusClass = r.receipt_done ? "done" : "warn";

    body.innerHTML += `
      <tr>
        <td>${r.item_name_snapshot}</td>
        <td>${r.order_qty}</td>
        <td>${r.receipt_qty}</td>
        <td>${r.remain_qty}</td>
        <td>${r.current_stock}</td>
        <td>
          <input class="table-input" type="number"
                 min="0"
                 max="${r.remain_qty}"
                 value="0"
                 ${r.receipt_done ? "disabled" : ""}
                 onchange="receipt_setReceiveQty(${i}, this.value)">
        </td>
        <td class="${statusClass}">${statusText}</td>
      </tr>
    `;
  });
}

function receipt_setReceiveQty(index, value) {
  const qty = Number(value || 0);
  const remain = Number(receipt_items[index].remain_qty || 0);

  if (qty > remain) {
    alert("잔량보다 많이 입력할 수 없습니다.");
    receipt_items[index].receive_qty = remain;
    receipt_render();
    return;
  }

  receipt_items[index].receive_qty = qty < 0 ? 0 : qty;
}

async function receipt_process() {
  if (!receipt_selectedId) {
    alert("발주를 선택하세요.");
    return;
  }

  const memo = document.getElementById("receipt_memo").value.trim();
  const targets = receipt_items.filter(x => !x.receipt_done && Number(x.receive_qty) > 0);

  if (targets.length === 0) {
    alert("입고 처리할 수량을 입력하세요.");
    return;
  }

  if (!confirm("입고 처리 진행하시겠습니까?\n재고가 증가하고 입고이력이 저장됩니다.")) {
    return;
  }

  for (const r of targets) {
    if (!r.material_id) {
      alert(`자재 연결이 없는 항목입니다: ${r.item_name_snapshot}`);
      return;
    }
    if (Number(r.receive_qty) > Number(r.remain_qty)) {
      alert(`잔량 초과 항목이 있습니다: ${r.item_name_snapshot}`);
      return;
    }

    const { data: mat, error: matError } = await db
      .from("materials")
      .select("*")
      .eq("id", r.material_id)
      .single();

    if (matError) {
      alert("자재 조회 실패: " + matError.message);
      return;
    }

    const beforeQty = Number(mat.stock_qty || 0);
    const addQty = Number(r.receive_qty || 0);
    const newQty = beforeQty + addQty;

    const { error: updateMatError } = await db
      .from("materials")
      .update({
        stock_qty: newQty,
        updated_at: new Date().toISOString()
      })
      .eq("id", r.material_id);

    if (updateMatError) {
      alert("재고 업데이트 실패: " + updateMatError.message);
      return;
    }

    const newReceiptQty = Number(r.receipt_qty || 0) + addQty;
    const isDone = newReceiptQty >= Number(r.order_qty || 0);

    const { error: updateItemError } = await db
      .from("purchase_list_items")
      .update({
        receipt_qty: newReceiptQty,
        receipt_done: isDone,
        updated_at: new Date().toISOString()
      })
      .eq("id", r.id);

    if (updateItemError) {
      alert("입고상태 업데이트 실패: " + updateItemError.message);
      return;
    }

    const { error: logError } = await db
      .from("stock_logs")
      .insert([{
        material_id: r.material_id,
        change_type: "IN",
        qty: addQty,
        before_qty: beforeQty,
        after_qty: newQty,
        memo: `[입고] ${receipt_selectedHeader?.order_no ?? ""} / ${memo}`
      }]);

    if (logError) {
      alert("입고이력 저장 실패: " + logError.message);
      return;
    }
  }

  alert("입고 완료");
  await receipt_loadSelected();
  if (materialManageInitialized) await material_loadMaterials();
  if (purchaseInitialized && document.getElementById("purchase_vendor_select").value) {
    await purchase_loadVendorMaterials();
  }
}

async function receipt_init() {
  await receipt_loadRecent();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}



async function fetchConfirmedQuoteAddressRows() {
  const { data, error } = await estimateDb
    .from("quotes")
    .select(`
      id,
      quote_no,
      quote_status,
      site_id,
      sites (
        id,
        site_address,
        customer_id,
        customers (
          id,
          customer_name,
          phone
        )
      )
    `)
    .eq("quote_status", "확정견적")
    .limit(5000);

  if (error) throw error;

  const map = new Map();

  (data || []).forEach(row => {
    const siteRow = row?.sites;
    const address = counselLogs_normalizeAddress(siteRow?.site_address);
    if (!siteRow || !address) return;

    if (!map.has(address)) {
      map.set(address, {
        quote_id: row.id,
        quote_no: row.quote_no || "",
        quote_status: row.quote_status || "",
        site_id: siteRow.id,
        site_address: address,
        customer_name: siteRow?.customers?.customer_name || "",
        phone: siteRow?.customers?.phone || ""
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.site_address.localeCompare(b.site_address, "ko"));
}

async function syncConfirmedEstimateAddressesToSiteDb() {
  try {
    const confirmedRows = await fetchConfirmedQuoteAddressRows();
    const confirmedAddresses = confirmedRows.map(row => counselLogs_normalizeAddress(row.site_address)).filter(Boolean);
    const confirmedSet = new Set(confirmedAddresses);

    const { data: siteRows, error: siteError } = await db
      .from("site_addresses")
      .select("id, site_address, is_active")
      .order("site_address", { ascending: true });

    if (siteError) throw siteError;

    const existingMap = new Map();
    (siteRows || []).forEach(row => {
      const key = counselLogs_normalizeAddress(row.site_address);
      if (key) existingMap.set(key, row);
    });

    const insertRows = [];
    for (const row of confirmedRows) {
      const key = counselLogs_normalizeAddress(row.site_address);
      const existing = existingMap.get(key);
      if (!existing) {
        insertRows.push({
          site_address: row.site_address,
          note: "견적 ERP 확정견적 주소 동기화",
          is_active: true,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (insertRows.length) {
      const { error: insertError } = await db.from("site_addresses").insert(insertRows);
      if (insertError) throw insertError;
    }

    for (const row of (siteRows || [])) {
      const key = counselLogs_normalizeAddress(row.site_address);
      const nextActive = confirmedSet.has(key);
      if (row.is_active !== nextActive) {
        const { error: updateError } = await db
          .from("site_addresses")
          .update({
            is_active: nextActive,
            updated_at: new Date().toISOString()
          })
          .eq("id", row.id);
        if (updateError) throw updateError;
      }
    }

    return confirmedAddresses;
  } catch (err) {
    console.error("확정견적 주소 동기화 실패:", err);
    return [];
  }
}


function counselLogs_pickDate(row) {
  return String(
    row?.quote_date ||
    row?.counsel_date ||
    row?.created_at ||
    row?.updated_at ||
    ""
  ).slice(0, 10);
}

function counselLogs_pickPhone(row) {
  return String(row?.customer_phone || row?.phone || "").trim();
}

function counselLogs_pickMemo(row) {
  return String(row?.counsel_note || row?.memo || "").trim();
}

function counselLogs_setDetail(row) {
  document.getElementById("counselDetailDate").value = counselLogs_pickDate(row);
  document.getElementById("counselDetailName").value = row?.customer_name || "";
  document.getElementById("counselDetailPhone").value = counselLogs_pickPhone(row);
  document.getElementById("counselDetailSiteName").value = row?.site_name || "";
  document.getElementById("counselDetailAddress").value = row?.site_address || "";
  document.getElementById("counselDetailMemo").value = counselLogs_pickMemo(row);
}

function counselLogs_normalizeAddress(addr) {
  return String(addr || "").replace(/\s+/g, " ").trim();
}


async function counselLogs_fetchConfirmedAddresses() {
  const rows = await fetchConfirmedQuoteAddressRows();
  return rows.map(row => ({
    site_address: row.site_address,
    site_name: ""
  }));
}


function counselLogs_renderAddressOptions(rows) {
  const select = document.getElementById("counselAddressSelect");
  const body = document.getElementById("counselAddressBody");
  const count = document.getElementById("counselAddressCount");
  if (!select || !body || !count) return;

  const selected = select.value || "";
  select.innerHTML = '<option value="">주소를 선택하세요</option>';
  body.innerHTML = "";

  rows.forEach((row) => {
    const opt = document.createElement("option");
    opt.value = row.site_address || "";
    opt.textContent = row.site_address || "";
    select.appendChild(opt);

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(row.site_address || "")}</td>`;
    tr.onclick = () => {
      select.value = row.site_address || "";
      counselLogs_onAddressChange();
    };
    body.appendChild(tr);
  });

  count.textContent = `상담주소 ${rows.length}건`;

  if (selected && rows.some(r => r.site_address === selected)) {
    select.value = selected;
  }
  counselLogs_highlightSelectedAddress();
}

function counselLogs_highlightSelectedAddress() {
  const selected = document.getElementById("counselAddressSelect")?.value || "";
  document.querySelectorAll("#counselAddressBody tr").forEach((tr) => {
    const text = tr.children?.[0]?.textContent || "";
    tr.classList.toggle("selected", !!selected && text === selected);
  });
}

function counselLogs_filterAddressOptions() {
  const keyword = counselLogs_normalizeAddress(document.getElementById("counselAddressKeyword")?.value || "").toLowerCase();
  counselFilteredAddressRows = !keyword
    ? [...counselConfirmedAddressRows]
    : counselConfirmedAddressRows.filter((row) => String(row.site_address || "").toLowerCase().includes(keyword));
  counselLogs_renderAddressOptions(counselFilteredAddressRows);
}

async function counselLogs_refreshAddressList() {
  try {
      counselConfirmedAddressRows = await counselLogs_fetchConfirmedAddresses();
    counselFilteredAddressRows = [...counselConfirmedAddressRows];
    counselLogs_renderAddressOptions(counselFilteredAddressRows);
    const status = document.getElementById("counselLogsStatus");
    if (status) status.textContent = "주소를 선택하세요.";
    if (!document.getElementById("counselAddressSelect")?.value) {
      counselLogs_setDetail({});
      document.getElementById("counselLogsBody").innerHTML = "";
    }
  } catch (err) {
    const status = document.getElementById("counselLogsStatus");
    if (status) status.textContent = "상담주소 불러오기 오류: " + err.message;
  }
}

async function counselLogs_searchByAddress(address) {
  const body = document.getElementById("counselLogsBody");
  const status = document.getElementById("counselLogsStatus");
  if (!body || !status) return;

  body.innerHTML = "";
  counselCurrentRows = [];
  counselLogs_setDetail({});

  if (!address) {
    status.textContent = "주소를 선택하세요.";
    return;
  }

  try {
    const { data, error } = await estimateDb
      .from("quote_counsel_logs")
      .select("*")
      .ilike("site_address", address)
      .limit(1000);

    if (error) throw error;

    const normalized = counselLogs_normalizeAddress(address);
    const rows = (data || [])
      .filter((row) => counselLogs_normalizeAddress(row?.site_address) === normalized)
      .sort((a, b) => {
        const ad = counselLogs_pickDate(a);
        const bd = counselLogs_pickDate(b);
        if (ad !== bd) return bd.localeCompare(ad);
        return String(b?.updated_at || b?.created_at || "").localeCompare(String(a?.updated_at || a?.created_at || ""));
      });

    counselCurrentRows = rows;

    if (!rows.length) {
      status.textContent = "선택한 주소의 상담일지가 없습니다.";
      return;
    }

    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(counselLogs_pickDate(row))}</td>
        <td>${escapeHtml(row.customer_name || "")}</td>
        <td>${escapeHtml(counselLogs_pickPhone(row))}</td>
        <td>${escapeHtml(row.site_name || "")}</td>
        <td style="white-space:normal;min-width:260px;">${escapeHtml(counselLogs_pickMemo(row)).replace(/\n/g, "<br>")}</td>
      `;
      tr.onclick = () => {
        document.querySelectorAll("#counselLogsBody tr").forEach(x => x.classList.remove("selected"));
        tr.classList.add("selected");
        counselLogs_setDetail(row);
      };
      if (index === 0) {
        tr.classList.add("selected");
        counselLogs_setDetail(row);
      }
      body.appendChild(tr);
    });
    status.textContent = `선택 주소 상담일지 ${rows.length}건`;
  } catch (err) {
    console.error(err);
    status.textContent = "상담일지 조회 오류: " + err.message;
  }
}

function counselLogs_onAddressChange() {
  counselLogs_highlightSelectedAddress();
  const address = document.getElementById("counselAddressSelect")?.value || "";
  counselLogs_searchByAddress(address);
}

function counselLogs_search() {
  const address = document.getElementById("counselAddressSelect")?.value || "";
  counselLogs_searchByAddress(address);
}

function counselLogs_clear() {
  const select = document.getElementById("counselAddressSelect");
  const keyword = document.getElementById("counselAddressKeyword");
  const body = document.getElementById("counselLogsBody");
  const status = document.getElementById("counselLogsStatus");

  if (keyword) keyword.value = "";
  if (select) select.value = "";
  if (body) body.innerHTML = "";
  if (status) status.textContent = "주소를 선택하세요.";

  counselFilteredAddressRows = [...counselConfirmedAddressRows];
  counselLogs_renderAddressOptions(counselFilteredAddressRows);
  counselLogs_setDetail({});
}
