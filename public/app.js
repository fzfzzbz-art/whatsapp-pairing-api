const API = {
    pairing: '/api/pairing',
    qr: '/api/qr',
};

const langTexts = {
    en: {
        headerSub: "Link your WhatsApp device below",
        btn: "🔗 Link Device",
        loginHeader: "Connection Details",
        loginSub: "Enter number for pairing code",
        numLabel: "WhatsApp Number",
        notice: "Bot takes 3 minutes to activate after linking. ⏳",
        loading: "⏳ Processing...",
        successTitle: "🎉 Success!",
        successBody: "Your Code:",
        qrHeader: "QR Login",
        qrPlaceholder: "Tap to load QR"
    },
    ar: {
        headerSub: "قم بربط جهاز واتساب الخاص بك",
        btn: "🔗 ربط الجهاز",
        loginHeader: "تفاصيل الاتصال",
        loginSub: "أدخل الرقم لتوليد كود الربط",
        numLabel: "رقم الواتساب",
        notice: "يستغرق البوت 3 دقائق ليتفعل بعد الربط. ⏳",
        loading: "⏳ جاري المعالجة...",
        successTitle: "🎉 نجاح!",
        successBody: "كود الربط الخاص بك:",
        qrHeader: "تسجيل دخول QR",
        qrPlaceholder: "انقر لتحميل الرمز"
    }
};

let currentLang = 'en';

function initPage(lang) {
    currentLang = lang;
    document.getElementById('langOverlay').style.display = 'none';
    document.getElementById('mainBody').style.display = 'block';
    updateTexts();
}

function updateTexts() {
    const t = langTexts[currentLang];
    document.getElementById('headerSub').innerText = t.headerSub;
    document.getElementById('loginHeader').innerText = t.loginHeader;
    document.getElementById('loginSubText').innerText = t.loginSub;
    document.getElementById('numLabel').innerText = t.numLabel;
    document.getElementById('submitBtn').innerText = t.btn;
    document.getElementById('noticeText').innerText = t.notice;
    document.getElementById('qrHeader').innerText = t.qrHeader;
}

function switchTab(tab) {
    if (tab === 'qr') {
        document.getElementById('panelPairing').classList.add('hidden');
        document.getElementById('panelQr').classList.remove('hidden');
        document.getElementById('tabQr').classList.add('active');
        document.getElementById('tabPairing').classList.remove('active');
        loadQr();
    } else {
        document.getElementById('panelQr').classList.add('hidden');
        document.getElementById('panelPairing').classList.remove('hidden');
        document.getElementById('tabPairing').classList.add('active');
        document.getElementById('tabQr').classList.remove('active');
    }
}

async function loadQr() {
    const img = document.getElementById('qrImage');
    const placeholder = document.getElementById('qrPlaceholder');
    placeholder.innerText = "Loading...";
    
    img.src = `${API.qr}?t=${Date.now()}`;
    img.onload = () => {
        img.style.display = 'block';
        placeholder.style.display = 'none';
    };
}

async function handleSubmit() {
    const t = langTexts[currentLang];
    let phone = document.getElementById('phoneNum').value.replace(/\s+/g, '');

    if (!phone) return Swal.fire('Error', 'Input number', 'warning');

    Swal.fire({
        title: t.loading,
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await fetch(API.pairing, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num: phone })
        });
        const result = await response.json();

        if (result.success) {
            Swal.fire({
                title: t.successTitle,
                html: `<b style="font-size:2rem; color:#d4a055;">${result.code}</b>`,
                icon: 'success'
            });
        }
    } catch (err) {
        Swal.fire('Error', 'Failed to get code', 'error');
    }
}
