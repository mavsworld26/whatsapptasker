// Message catalog: English (en), Telugu (te), Hindi (hi) and Hinglish (hinglish, Hindi in Latin script).
// Telugu and Hindi strings were drafted by engineering and MUST be reviewed by native speakers before launch.
// Command keywords (POST, OFFER HYD0001 700, …) stay in Latin script in every language so they remain
// unambiguous; localized aliases for the main commands are accepted in commands.js.

export const LANGS = ['en', 'te', 'hi', 'hinglish'];
export const LANG_NAMES = { en: 'English', te: 'తెలుగు (Telugu)', hi: 'हिंदी (Hindi)', hinglish: 'Hinglish' };
// Meta template language codes. Meta has no Hinglish locale; Hinglish users receive the English template.
export const TEMPLATE_LANG = { en: 'en', te: 'te', hi: 'hi', hinglish: 'en' };

const M = {
  welcome: {
    en: 'Welcome to HYD Tasks 👋 — get local help in Hyderabad, all on WhatsApp.\nChoose your language.',
    te: 'HYD Tasks కు స్వాగతం 👋 — హైదరాబాద్‌లో స్థానిక సహాయం, అంతా WhatsApp లోనే.\nమీ భాషను ఎంచుకోండి.',
    hi: 'HYD Tasks में आपका स्वागत है 👋 — हैदराबाद में लोकल मदद, सब कुछ WhatsApp पर।\nअपनी भाषा चुनें।',
    hinglish: 'HYD Tasks mein swagat hai 👋 — Hyderabad mein local help, sab WhatsApp par.\nApni language chuniye.',
  },
  terms: {
    en: 'Before we start: by replying AGREE you accept our Terms ({terms}) and Privacy Notice ({privacy}), and agree to receive WhatsApp messages about your jobs (send STOP anytime). We store your phone number, messages about your jobs and payment references. We never ask for card, bank or Aadhaar numbers in chat.',
    te: 'ప్రారంభించే ముందు: AGREE అని పంపితే మీరు మా నిబంధనలు ({terms}) మరియు గోప్యతా నోటీసు ({privacy}) అంగీకరిస్తారు, మీ పనుల గురించి WhatsApp సందేశాలు పొందడానికి సమ్మతిస్తారు (ఎప్పుడైనా STOP పంపండి). మేము మీ ఫోన్ నంబర్, మీ పనుల సందేశాలు మరియు చెల్లింపు రిఫరెన్స్‌లను నిల్వ చేస్తాము. చాట్‌లో కార్డ్, బ్యాంక్ లేదా ఆధార్ నంబర్లు ఎప్పుడూ అడగము.',
    hi: 'शुरू करने से पहले: AGREE भेजकर आप हमारी शर्तें ({terms}) और प्राइवेसी नोटिस ({privacy}) स्वीकार करते हैं, और अपने कामों के बारे में WhatsApp मैसेज पाने के लिए सहमति देते हैं (कभी भी STOP भेजें)। हम आपका फ़ोन नंबर, आपके कामों से जुड़े संदेश और पेमेंट रेफ़रेंस रखते हैं। हम चैट में कभी कार्ड, बैंक या आधार नंबर नहीं माँगते।',
    hinglish: 'Shuru karne se pehle: AGREE bhejkar aap hamari Terms ({terms}) aur Privacy Notice ({privacy}) accept karte hain, aur apne kaam ke baare mein WhatsApp messages paane ke liye agree karte hain (kabhi bhi STOP bhejiye). Hum aapka phone number, aapke kaam ke messages aur payment reference store karte hain. Chat mein kabhi card, bank ya Aadhaar number nahi maangte.',
  },
  menu: {
    en: 'HYD Tasks menu\n• POST — post a job\n• MYJOBS — track your jobs\n• JOIN — work with us as a tasker\n• HELP — talk to support\n• LANG — change language\n• STOP — stop messages\nServing: {areas}.',
    te: 'HYD Tasks మెను\n• POST — పని పోస్ట్ చేయండి\n• MYJOBS — మీ పనులు చూడండి\n• JOIN — టాస్కర్‌గా చేరండి\n• HELP — సపోర్ట్‌తో మాట్లాడండి\n• LANG — భాష మార్చండి\n• STOP — సందేశాలు ఆపండి\nసేవలు: {areas}.',
    hi: 'HYD Tasks मेनू\n• POST — काम पोस्ट करें\n• MYJOBS — अपने काम देखें\n• JOIN — टास्कर बनें\n• HELP — सपोर्ट से बात करें\n• LANG — भाषा बदलें\n• STOP — मैसेज बंद करें\nसेवा क्षेत्र: {areas}.',
    hinglish: 'HYD Tasks menu\n• POST — kaam post karein\n• MYJOBS — apne kaam dekhein\n• JOIN — tasker baniye\n• HELP — support se baat karein\n• LANG — language badlein\n• STOP — messages band karein\nAreas: {areas}.',
  },
  btn_post: { en: 'Post a job', te: 'పని పోస్ట్', hi: 'काम पोस्ट करें', hinglish: 'Kaam post karo' },
  btn_myjobs: { en: 'My jobs', te: 'నా పనులు', hi: 'मेरे काम', hinglish: 'Mere kaam' },
  btn_join: { en: 'Become a tasker', te: 'టాస్కర్ అవ్వండి', hi: 'टास्कर बनें', hinglish: 'Tasker bano' },
  btn_help: { en: 'Help', te: 'సహాయం', hi: 'मदद', hinglish: 'Help' },
  btn_yes: { en: 'Yes, post it', te: 'అవును, పోస్ట్', hi: 'हाँ, पोस्ट करें', hinglish: 'Haan, post karo' },
  btn_cancel: { en: 'Cancel', te: 'రద్దు', hi: 'रद्द करें', hinglish: 'Cancel' },
  btn_agree: { en: 'I agree', te: 'అంగీకరిస్తున్నాను', hi: 'मैं सहमत हूँ', hinglish: 'Haan, agree' },
  btn_confirm: { en: 'Confirm done', te: 'పూర్తి నిర్ధారించు', hi: 'काम पूरा', hinglish: 'Kaam pura' },
  btn_dispute: { en: 'Report problem', te: 'సమస్య చెప్పండి', hi: 'समस्या बताएँ', hinglish: 'Problem batao' },
  lang_set: {
    en: 'Language set to English.', te: 'భాష తెలుగుకు మార్చబడింది.', hi: 'भाषा हिंदी कर दी गई है।', hinglish: 'Language Hinglish set ho gayi.',
  },
  agreed: {
    en: 'Thanks! You can now use HYD Tasks.', te: 'ధన్యవాదాలు! మీరు ఇప్పుడు HYD Tasks ఉపయోగించవచ్చు.', hi: 'धन्यवाद! अब आप HYD Tasks इस्तेमाल कर सकते हैं।', hinglish: 'Thanks! Ab aap HYD Tasks use kar sakte hain.',
  },
  need_agree: {
    en: 'Please reply AGREE to accept the Terms first, or STOP to opt out.', te: 'దయచేసి ముందుగా నిబంధనలు అంగీకరించడానికి AGREE పంపండి, లేదా STOP పంపండి.', hi: 'कृपया पहले शर्तें स्वीकार करने के लिए AGREE भेजें, या STOP भेजें।', hinglish: 'Pehle Terms accept karne ke liye AGREE bhejiye, ya STOP bhejiye.',
  },
  unknown: {
    en: "Sorry, I didn't understand. Send MENU to see options.", te: 'క్షమించండి, అర్థం కాలేదు. ఎంపికల కోసం MENU పంపండి.', hi: 'माफ़ कीजिए, समझ नहीं आया। विकल्प देखने के लिए MENU भेजें।', hinglish: 'Sorry, samajh nahi aaya. Options ke liye MENU bhejiye.',
  },
  opted_out: {
    en: 'You will no longer receive messages from HYD Tasks. Send START to opt back in.', te: 'ఇకపై HYD Tasks నుండి సందేశాలు రావు. మళ్లీ చేరడానికి START పంపండి.', hi: 'अब आपको HYD Tasks से मैसेज नहीं मिलेंगे। दोबारा शुरू करने के लिए START भेजें।', hinglish: 'Ab aapko HYD Tasks se messages nahi aayenge. Wapas shuru karne ke liye START bhejiye.',
  },
  opted_in: {
    en: 'You are opted in again. Send MENU to see options.', te: 'మీరు మళ్లీ చేరారు. MENU పంపండి.', hi: 'आप फिर से जुड़ गए हैं। MENU भेजें।', hinglish: 'Aap phir se jud gaye. MENU bhejiye.',
  },
  rate_limited: {
    en: 'You are sending messages too quickly. Please wait a minute.', te: 'మీరు చాలా వేగంగా సందేశాలు పంపుతున్నారు. ఒక నిమిషం ఆగండి.', hi: 'आप बहुत जल्दी मैसेज भेज रहे हैं। एक मिनट रुकिए।', hinglish: 'Aap bahut jaldi messages bhej rahe hain. Ek minute rukiye.',
  },
  draft_cancelled: {
    en: 'Cancelled. Send POST to start again.', te: 'రద్దు చేయబడింది. మళ్లీ ప్రారంభించడానికి POST పంపండి.', hi: 'रद्द कर दिया। फिर से शुरू करने के लिए POST भेजें।', hinglish: 'Cancel ho gaya. Dobara shuru karne ke liye POST bhejiye.',
  },
  media_unsupported: {
    en: 'Please type your reply as text (or share a location pin when asked). Voice notes and photos are not processed yet.', te: 'దయచేసి టెక్స్ట్‌లో జవాబు ఇవ్వండి (అడిగినప్పుడు లొకేషన్ పంపండి). వాయిస్ నోట్స్, ఫోటోలు ఇంకా ప్రాసెస్ చేయబడవు.', hi: 'कृपया जवाब टेक्स्ट में लिखें (पूछे जाने पर लोकेशन भेजें)। वॉइस नोट और फ़ोटो अभी प्रोसेस नहीं होते।', hinglish: 'Please reply text mein likhiye (poochhne par location bhejiye). Voice notes aur photos abhi process nahi hote.',
  },
  // ---- posting ----
  ask_description: {
    en: 'Describe the job in one message (12–500 characters). Example: Move a sofa and fridge to the 2nd floor, 2 helpers needed.',
    te: 'పనిని ఒకే సందేశంలో వివరించండి (12–500 అక్షరాలు). ఉదా: సోఫా, ఫ్రిజ్‌ను 2వ అంతస్తుకు మార్చాలి, 2 సహాయకులు కావాలి.',
    hi: 'काम एक मैसेज में बताइए (12–500 अक्षर)। उदाहरण: सोफ़ा और फ्रिज दूसरी मंज़िल पर ले जाना है, 2 हेल्पर चाहिए।',
    hinglish: 'Kaam ek message mein batayiye (12–500 characters). Example: Sofa aur fridge 2nd floor par shift karna hai, 2 helpers chahiye.',
  },
  bad_description: { en: 'Please describe the job in 12–500 characters.', te: 'దయచేసి పనిని 12–500 అక్షరాల్లో వివరించండి.', hi: 'कृपया काम 12–500 अक्षरों में बताइए।', hinglish: 'Kaam 12–500 characters mein batayiye.' },
  ask_area: {
    en: 'Where is the job? Share a 📍 location pin or type the area (e.g. Gachibowli). Your exact address is shared only after booking.',
    te: 'పని ఎక్కడ? 📍 లొకేషన్ పంపండి లేదా ప్రాంతం పేరు టైప్ చేయండి (ఉదా: గచ్చిబౌలి). మీ పూర్తి చిరునామా బుకింగ్ తర్వాతే పంచుకోబడుతుంది.',
    hi: 'काम कहाँ है? 📍 लोकेशन भेजें या एरिया लिखें (जैसे गाचीबोवली)। पूरा पता बुकिंग के बाद ही शेयर होगा।',
    hinglish: 'Kaam kahan hai? 📍 Location bhejiye ya area likhiye (jaise Gachibowli). Poora address booking ke baad hi share hoga.',
  },
  bad_area: {
    en: "Sorry, we don't serve that location yet. Currently serving: {areas}.", te: 'క్షమించండి, ఆ ప్రాంతంలో ఇంకా సేవలు లేవు. ప్రస్తుతం: {areas}.', hi: 'माफ़ कीजिए, वह जगह अभी कवर नहीं है। अभी सेवा: {areas}.', hinglish: 'Sorry, woh location abhi cover nahi hai. Abhi service: {areas}.',
  },
  ask_budget: {
    en: 'What is your budget for the tasker, in rupees? Example: 800 (min ₹100). Taskers may bid higher or lower.',
    te: 'టాస్కర్‌కు మీ బడ్జెట్ ఎంత (రూపాయల్లో)? ఉదా: 800 (కనీసం ₹100). టాస్కర్లు ఎక్కువ లేదా తక్కువ బిడ్ వేయవచ్చు.',
    hi: 'टास्कर के लिए आपका बजट कितना है (रुपये में)? उदाहरण: 800 (कम से कम ₹100)। टास्कर ज़्यादा या कम बोली लगा सकते हैं।',
    hinglish: 'Tasker ke liye aapka budget kitna hai (rupees mein)? Example: 800 (min ₹100). Taskers zyada ya kam bid kar sakte hain.',
  },
  bad_budget: { en: 'Enter an amount between ₹100 and ₹1,00,000, e.g. 800.', te: '₹100 నుండి ₹1,00,000 మధ్య మొత్తం పంపండి, ఉదా: 800.', hi: '₹100 से ₹1,00,000 के बीच राशि लिखें, जैसे 800।', hinglish: '₹100 se ₹1,00,000 ke beech amount likhiye, jaise 800.' },
  ask_when: {
    en: 'When should the tasker come? Example: tomorrow 10 am, or 30 Nov 4 pm.', te: 'టాస్కర్ ఎప్పుడు రావాలి? ఉదా: రేపు 10 am, లేదా 30 Nov 4 pm.', hi: 'टास्कर कब आए? उदाहरण: कल सुबह 10 बजे, या 30 Nov 4 pm.', hinglish: 'Tasker kab aaye? Example: kal 10 am, ya 30 Nov 4 pm.',
  },
  bad_when: {
    en: 'Please give a date and time between 1 hour and 60 days from now, e.g. tomorrow 10 am.', te: 'ఇప్పటి నుండి 1 గంట నుండి 60 రోజుల మధ్య తేదీ, సమయం ఇవ్వండి, ఉదా: రేపు 10 am.', hi: 'अभी से 1 घंटे से 60 दिन के बीच तारीख और समय बताइए, जैसे कल 10 am।', hinglish: 'Abhi se 1 ghante se 60 din ke beech date aur time batayiye, jaise kal 10 am.',
  },
  review_task: {
    en: 'Please check your job:\n{description}\n📍 {area}\n💰 Budget {budget}\n🕒 {when}\n🏷️ {category}\nPost it?',
    te: 'మీ పనిని సరిచూడండి:\n{description}\n📍 {area}\n💰 బడ్జెట్ {budget}\n🕒 {when}\n🏷️ {category}\nపోస్ట్ చేయాలా?',
    hi: 'अपना काम जाँचें:\n{description}\n📍 {area}\n💰 बजट {budget}\n🕒 {when}\n🏷️ {category}\nपोस्ट करें?',
    hinglish: 'Apna kaam check kariye:\n{description}\n📍 {area}\n💰 Budget {budget}\n🕒 {when}\n🏷️ {category}\nPost karein?',
  },
  confirm_yes: { en: 'Reply YES to post or CANCEL to discard.', te: 'పోస్ట్ చేయడానికి YES, రద్దు చేయడానికి CANCEL పంపండి.', hi: 'पोस्ट करने के लिए YES, रद्द करने के लिए CANCEL भेजें।', hinglish: 'Post karne ke liye YES, cancel ke liye CANCEL bhejiye.' },
  post_limit: { en: 'Limit reached: {n} jobs per 24 hours. Send HELP if you need more.', te: 'పరిమితి: 24 గంటల్లో {n} పనులు. ఎక్కువ కావాలంటే HELP పంపండి.', hi: 'सीमा: 24 घंटे में {n} काम। ज़्यादा चाहिए तो HELP भेजें।', hinglish: 'Limit: 24 ghante mein {n} kaam. Zyada chahiye to HELP bhejiye.' },
  task_posted: {
    en: '✅ {id} is live. We have alerted {n} matching verified taskers. Offers will arrive here. No payment is taken until you choose an offer.',
    te: '✅ {id} పోస్ట్ అయింది. {n} సరిపోయే ధృవీకరించిన టాస్కర్లకు తెలియజేశాం. ఆఫర్లు ఇక్కడే వస్తాయి. మీరు ఆఫర్ ఎంచుకునే వరకు చెల్లింపు తీసుకోము.',
    hi: '✅ {id} लाइव है। {n} वेरिफ़ाइड टास्कर को सूचना दी गई। ऑफ़र यहीं आएँगे। ऑफ़र चुनने तक कोई पेमेंट नहीं लिया जाएगा।',
    hinglish: '✅ {id} live hai. {n} verified taskers ko alert bheja gaya. Offers yahin aayenge. Offer chunne tak koi payment nahi liya jayega.',
  },
  task_in_review: {
    en: '🕵️ {id} needs a quick safety review by our team before taskers can see it. We will update you here.',
    te: '🕵️ {id} టాస్కర్లకు కనిపించే ముందు మా టీమ్ భద్రతా సమీక్ష చేయాలి. ఇక్కడే తెలియజేస్తాం.',
    hi: '🕵️ {id} टास्कर को दिखने से पहले हमारी टीम सुरक्षा जाँच करेगी। हम यहीं अपडेट देंगे।',
    hinglish: '🕵️ {id} taskers ko dikhne se pehle hamari team safety review karegi. Yahin update denge.',
  },
  task_released: { en: '✅ {id} was approved and is now visible to {n} matching taskers.', te: '✅ {id} ఆమోదించబడింది, ఇప్పుడు {n} టాస్కర్లకు కనిపిస్తుంది.', hi: '✅ {id} मंज़ूर हो गया और अब {n} टास्कर को दिख रहा है।', hinglish: '✅ {id} approve ho gaya, ab {n} taskers ko dikh raha hai.' },
  task_rejected: { en: '❌ {id} could not be approved: {reason}. Send HELP if you have questions.', te: '❌ {id} ఆమోదించబడలేదు: {reason}. ప్రశ్నలు ఉంటే HELP పంపండి.', hi: '❌ {id} मंज़ूर नहीं हुआ: {reason}। सवाल हों तो HELP भेजें।', hinglish: '❌ {id} approve nahi hua: {reason}. Sawal ho to HELP bhejiye.' },
  no_jobs: { en: 'You have no jobs yet. Send POST to create one.', te: 'మీకు ఇంకా పనులు లేవు. POST పంపండి.', hi: 'अभी कोई काम नहीं है। POST भेजें।', hinglish: 'Abhi koi kaam nahi hai. POST bhejiye.' },
  my_jobs: { en: 'Your recent jobs:\n{list}\nSend STATUS HYD0001 for details.', te: 'మీ ఇటీవలి పనులు:\n{list}\nవివరాలకు STATUS HYD0001 పంపండి.', hi: 'आपके हाल के काम:\n{list}\nविवरण के लिए STATUS HYD0001 भेजें।', hinglish: 'Aapke recent kaam:\n{list}\nDetails ke liye STATUS HYD0001 bhejiye.' },
  not_found: { en: 'Job not found or not accessible.', te: 'పని కనబడలేదు లేదా మీకు అందుబాటులో లేదు.', hi: 'काम नहीं मिला या उपलब्ध नहीं है।', hinglish: 'Kaam nahi mila ya accessible nahi hai.' },
  not_allowed: { en: 'That action is not available for this job right now.', te: 'ఈ పనికి ఇప్పుడు ఆ చర్య అందుబాటులో లేదు.', hi: 'इस काम के लिए अभी यह संभव नहीं है।', hinglish: 'Is kaam ke liye abhi yeh possible nahi hai.' },
  // ---- offers ----
  offer_received: {
    en: '📩 New offer for {id}: {amount} from {worker} ⭐ {rating} · {jobs} jobs done · {distance} km away.{note}\nReply ACCEPT {offer} to book, or STATUS {id} to compare all offers.',
    te: '📩 {id} కు కొత్త ఆఫర్: {amount} — {worker} ⭐ {rating} · {jobs} పనులు పూర్తి · {distance} కి.మీ.{note}\nబుక్ చేయడానికి ACCEPT {offer} పంపండి, లేదా అన్ని ఆఫర్ల కోసం STATUS {id}.',
    hi: '📩 {id} के लिए नया ऑफ़र: {amount} — {worker} ⭐ {rating} · {jobs} काम पूरे · {distance} km दूर।{note}\nबुक करने के लिए ACCEPT {offer} भेजें, या सभी ऑफ़र के लिए STATUS {id}।',
    hinglish: '📩 {id} ke liye naya offer: {amount} — {worker} ⭐ {rating} · {jobs} kaam done · {distance} km door.{note}\nBook karne ke liye ACCEPT {offer} bhejiye, ya saare offers ke liye STATUS {id}.',
  },
  offers_header: { en: 'Offers (best match first):', te: 'ఆఫర్లు (ఉత్తమమైనవి ముందు):', hi: 'ऑफ़र (सबसे अच्छे पहले):', hinglish: 'Offers (best match pehle):' },
  offer_accepted_customer: {
    en: 'You chose offer #{offer} for {id}.\nTasker quote {quote} + service fee {fee} + GST on fee {gst} = Total {total}.\nWe are preparing your secure payment request.',
    te: 'మీరు {id} కోసం ఆఫర్ #{offer} ఎంచుకున్నారు.\nటాస్కర్ కోట్ {quote} + సర్వీస్ ఫీ {fee} + ఫీపై GST {gst} = మొత్తం {total}.\nసురక్షిత చెల్లింపు అభ్యర్థన సిద్ధం చేస్తున్నాం.',
    hi: 'आपने {id} के लिए ऑफ़र #{offer} चुना।\nटास्कर कोट {quote} + सर्विस फ़ीस {fee} + फ़ीस पर GST {gst} = कुल {total}।\nहम आपका सुरक्षित पेमेंट अनुरोध तैयार कर रहे हैं।',
    hinglish: 'Aapne {id} ke liye offer #{offer} chuna.\nTasker quote {quote} + service fee {fee} + fee par GST {gst} = Total {total}.\nHum aapka secure payment request bana rahe hain.',
  },
  offer_selected_worker: {
    en: '🎉 Your offer for {id} was selected. Waiting for the customer to pay. Do NOT start until you receive a BOOKED message.',
    te: '🎉 {id} కోసం మీ ఆఫర్ ఎంపికైంది. కస్టమర్ చెల్లింపు కోసం వేచి ఉంది. BOOKED సందేశం వచ్చే వరకు పని ప్రారంభించవద్దు.',
    hi: '🎉 {id} के लिए आपका ऑफ़र चुना गया। ग्राहक के पेमेंट का इंतज़ार है। BOOKED मैसेज आने तक काम शुरू न करें।',
    hinglish: '🎉 {id} ke liye aapka offer select hua. Customer ke payment ka wait hai. BOOKED message aane tak kaam shuru mat kijiye.',
  },
  offer_not_selected: { en: '{id} was booked with another tasker. Thanks for your offer — send TASKS for more jobs.', te: '{id} మరో టాస్కర్‌తో బుక్ అయింది. ధన్యవాదాలు — మరిన్ని పనుల కోసం TASKS పంపండి.', hi: '{id} किसी और टास्कर के साथ बुक हो गया। धन्यवाद — और काम के लिए TASKS भेजें।', hinglish: '{id} kisi aur tasker ke saath book ho gaya. Thanks — aur kaam ke liye TASKS bhejiye.' },
  // ---- payments ----
  payments_unavailable: {
    en: 'Online payments are not active yet, so {id} cannot be booked. Our team has been notified. You have not been charged.',
    te: 'ఆన్‌లైన్ చెల్లింపులు ఇంకా ప్రారంభం కాలేదు, కాబట్టి {id} బుక్ చేయలేము. మా టీమ్‌కు తెలియజేశాం. మీ నుండి డబ్బు తీసుకోలేదు.',
    hi: 'ऑनलाइन पेमेंट अभी चालू नहीं है, इसलिए {id} बुक नहीं हो सकता। हमारी टीम को सूचना दी गई है। आपसे कोई पैसा नहीं लिया गया।',
    hinglish: 'Online payments abhi active nahi hain, isliye {id} book nahi ho sakta. Team ko inform kar diya. Aapse koi paisa nahi liya gaya.',
  },
  pay_link: {
    en: '💳 Pay {total} for {id} securely via Razorpay (UPI, cards, netbanking): {url}\nLink valid until {expires}. HYD Tasks will never ask for your UPI PIN or OTP in chat.',
    te: '💳 {id} కోసం {total} ను Razorpay ద్వారా సురక్షితంగా చెల్లించండి (UPI, కార్డ్, నెట్‌బ్యాంకింగ్): {url}\nలింక్ {expires} వరకు చెల్లుతుంది. HYD Tasks చాట్‌లో మీ UPI PIN లేదా OTP ఎప్పుడూ అడగదు.',
    hi: '💳 {id} के लिए {total} Razorpay से सुरक्षित भुगतान करें (UPI, कार्ड, नेटबैंकिंग): {url}\nलिंक {expires} तक मान्य है। HYD Tasks चैट में कभी आपका UPI PIN या OTP नहीं माँगेगा।',
    hinglish: '💳 {id} ke liye {total} Razorpay se securely pay kariye (UPI, cards, netbanking): {url}\nLink {expires} tak valid hai. HYD Tasks chat mein kabhi UPI PIN ya OTP nahi maangega.',
  },
  pay_in_chat: {
    en: '💳 Tap "Review and Pay" below to pay {total} for {id} inside WhatsApp.', te: '💳 {id} కోసం {total} ను WhatsApp లోనే చెల్లించడానికి క్రింద "Review and Pay" నొక్కండి.', hi: '💳 {id} के लिए {total} WhatsApp में ही भरने के लिए नीचे "Review and Pay" दबाएँ।', hinglish: '💳 {id} ke liye {total} WhatsApp mein hi pay karne ke liye neeche "Review and Pay" dabaiye.',
  },
  payment_status: { en: 'Payment for {id}: {total} — status: {status}.', te: '{id} చెల్లింపు: {total} — స్థితి: {status}.', hi: '{id} का पेमेंट: {total} — स्थिति: {status}।', hinglish: '{id} ka payment: {total} — status: {status}.' },
  payment_failed_retry: { en: 'We could not create the payment request for {id}. Our team is checking; you have not been charged.', te: '{id} కోసం చెల్లింపు అభ్యర్థన సృష్టించలేకపోయాం. టీమ్ పరిశీలిస్తోంది; మీ నుండి డబ్బు తీసుకోలేదు.', hi: '{id} के लिए पेमेंट अनुरोध नहीं बन सका। टीम जाँच कर रही है; आपसे पैसा नहीं लिया गया।', hinglish: '{id} ke liye payment request nahi ban saka. Team check kar rahi hai; aapse paisa nahi liya gaya.' },
  payment_expired: {
    en: 'The payment link for {id} expired, so the booking was released. Your job is open again — you can accept an offer again from STATUS {id}.',
    te: '{id} చెల్లింపు లింక్ గడువు ముగిసింది. మీ పని మళ్లీ ఓపెన్ అయింది — STATUS {id} నుండి మళ్లీ ఆఫర్ ఎంచుకోవచ్చు.',
    hi: '{id} का पेमेंट लिंक एक्सपायर हो गया। आपका काम फिर से खुला है — STATUS {id} से फिर ऑफ़र चुन सकते हैं।',
    hinglish: '{id} ka payment link expire ho gaya. Aapka kaam phir se open hai — STATUS {id} se dobara offer chun sakte hain.',
  },
  booked_customer: {
    en: '✅ Payment of {total} received for {id}. BOOKED with {worker} for {when}.\nSend your exact address with: ADDRESS {id} flat/house, street, landmark\nMessage your tasker: MSG {id} your message\nYour money is held by our payment partner and released to the tasker only after you confirm the job is done.',
    te: '✅ {id} కోసం {total} చెల్లింపు అందింది. {worker} తో {when} కు BOOKED.\nపూర్తి చిరునామా పంపండి: ADDRESS {id} ఫ్లాట్/ఇల్లు, వీధి, ల్యాండ్‌మార్క్\nటాస్కర్‌కు సందేశం: MSG {id} మీ సందేశం\nమీరు పని పూర్తయిందని నిర్ధారించిన తర్వాతే డబ్బు టాస్కర్‌కు విడుదల అవుతుంది.',
    hi: '✅ {id} के लिए {total} का पेमेंट मिला। {worker} के साथ {when} के लिए BOOKED।\nपूरा पता भेजें: ADDRESS {id} फ़्लैट/घर, गली, लैंडमार्क\nटास्कर को मैसेज: MSG {id} आपका मैसेज\nआप काम पूरा होने की पुष्टि करेंगे, तभी पैसा टास्कर को जाएगा।',
    hinglish: '✅ {id} ke liye {total} ka payment mila. {worker} ke saath {when} ke liye BOOKED.\nPoora address bhejiye: ADDRESS {id} flat/house, street, landmark\nTasker ko message: MSG {id} aapka message\nAap kaam complete confirm karenge tabhi paisa tasker ko jayega.',
  },
  booked_worker: {
    en: '✅ BOOKED: {id}\n{description}\n📍 {area} · 🕒 {when}\n💰 Your earning: {quote}\nThe customer will send the exact address here. Chat with them: MSG {id} your message\nWhen finished, send DONE {id}.',
    te: '✅ BOOKED: {id}\n{description}\n📍 {area} · 🕒 {when}\n💰 మీ సంపాదన: {quote}\nకస్టమర్ ఇక్కడ చిరునామా పంపుతారు. చాట్: MSG {id} మీ సందేశం\nపూర్తయ్యాక DONE {id} పంపండి.',
    hi: '✅ BOOKED: {id}\n{description}\n📍 {area} · 🕒 {when}\n💰 आपकी कमाई: {quote}\nग्राहक यहीं पता भेजेगा। बात करें: MSG {id} आपका मैसेज\nकाम पूरा होने पर DONE {id} भेजें।',
    hinglish: '✅ BOOKED: {id}\n{description}\n📍 {area} · 🕒 {when}\n💰 Aapki kamai: {quote}\nCustomer yahin address bhejega. Baat kariye: MSG {id} aapka message\nKaam pura hone par DONE {id} bhejiye.',
  },
  address_shared: { en: '📍 Address for {id}: {address}', te: '📍 {id} చిరునామా: {address}', hi: '📍 {id} का पता: {address}', hinglish: '📍 {id} ka address: {address}' },
  address_sent: { en: 'Address sent to your tasker.', te: 'చిరునామా టాస్కర్‌కు పంపబడింది.', hi: 'पता टास्कर को भेज दिया गया।', hinglish: 'Address tasker ko bhej diya.' },
  relay: { en: '💬 {id} — {from}: {body}\n(Reply: MSG {id} your message)', te: '💬 {id} — {from}: {body}\n(జవాబు: MSG {id} మీ సందేశం)', hi: '💬 {id} — {from}: {body}\n(जवाब: MSG {id} आपका मैसेज)', hinglish: '💬 {id} — {from}: {body}\n(Reply: MSG {id} aapka message)' },
  relay_sent: { en: 'Delivered ✔', te: 'పంపబడింది ✔', hi: 'भेज दिया ✔', hinglish: 'Bhej diya ✔' },
  // ---- completion ----
  done_worker: { en: 'Thanks! We asked the customer to confirm {id}. Payment is released after confirmation (or automatically after {hours} hours if they do not respond and no problem is reported).', te: 'ధన్యవాదాలు! {id} నిర్ధారించమని కస్టమర్‌ను అడిగాం. నిర్ధారణ తర్వాత (లేదా {hours} గంటల్లో స్పందన/ఫిర్యాదు లేకపోతే ఆటోమేటిక్‌గా) చెల్లింపు విడుదల అవుతుంది.', hi: 'धन्यवाद! हमने ग्राहक से {id} की पुष्टि करने को कहा है। पुष्टि के बाद (या {hours} घंटे में जवाब/शिकायत न होने पर अपने आप) पेमेंट रिलीज़ होगा।', hinglish: 'Thanks! Customer se {id} confirm karne ko kaha hai. Confirm ke baad (ya {hours} ghante mein jawab/shikayat na ho to automatically) payment release hoga.' },
  done_customer: {
    en: 'Your tasker marked {id} as done. Please check the work.\nIf everything is fine, confirm so we can pay the tasker. If not, report a problem. Auto-confirms in {hours} hours if you do not respond.',
    te: 'మీ టాస్కర్ {id} పూర్తయిందని తెలిపారు. పనిని చూడండి.\nసరిగా ఉంటే నిర్ధారించండి. లేకపోతే సమస్య తెలపండి. మీరు స్పందించకపోతే {hours} గంటల్లో ఆటోమేటిక్‌గా నిర్ధారించబడుతుంది.',
    hi: 'आपके टास्कर ने {id} पूरा बताया है। कृपया काम जाँचें।\nसब ठीक है तो पुष्टि करें। नहीं तो समस्या बताएँ। जवाब न देने पर {hours} घंटे में अपने आप पुष्टि हो जाएगी।',
    hinglish: 'Aapke tasker ne {id} done bataya hai. Kaam check kariye.\nSab theek hai to confirm kariye. Nahi to problem batayiye. Jawab na dene par {hours} ghante mein auto-confirm hoga.',
  },
  confirmed_customer: { en: '✅ {id} completed. Thank you! Please rate your tasker: RATE {id} 5 (1–5, you can add a comment after the number).', te: '✅ {id} పూర్తయింది. ధన్యవాదాలు! టాస్కర్‌కు రేటింగ్ ఇవ్వండి: RATE {id} 5 (1–5, సంఖ్య తర్వాత కామెంట్ రాయవచ్చు).', hi: '✅ {id} पूरा हुआ। धन्यवाद! टास्कर को रेटिंग दें: RATE {id} 5 (1–5, नंबर के बाद टिप्पणी लिख सकते हैं)।', hinglish: '✅ {id} complete. Thank you! Tasker ko rating dijiye: RATE {id} 5 (1–5, number ke baad comment likh sakte hain).' },
  confirmed_worker: { en: '✅ {id} confirmed. Your earning of {quote} is being released to your registered payout account by our payment partner. Rate the customer: RATE {id} 5', te: '✅ {id} నిర్ధారించబడింది. మీ సంపాదన {quote} మా చెల్లింపు భాగస్వామి ద్వారా మీ నమోదిత ఖాతాకు విడుదల అవుతోంది. కస్టమర్‌కు రేటింగ్: RATE {id} 5', hi: '✅ {id} की पुष्टि हुई। आपकी कमाई {quote} हमारे पेमेंट पार्टनर द्वारा आपके रजिस्टर्ड खाते में भेजी जा रही है। ग्राहक को रेटिंग दें: RATE {id} 5', hinglish: '✅ {id} confirm ho gaya. Aapki kamai {quote} payment partner se aapke registered account mein release ho rahi hai. Customer ko rating dijiye: RATE {id} 5' },
  payout_released: { en: '💸 Payout of {amount} for {id} has been released by Razorpay (ref {ref}). Bank credit follows the partner settlement schedule.', te: '💸 {id} కోసం {amount} చెల్లింపు Razorpay ద్వారా విడుదలైంది (ref {ref}). బ్యాంక్ జమ భాగస్వామి సెటిల్‌మెంట్ షెడ్యూల్ ప్రకారం.', hi: '💸 {id} के लिए {amount} का पेआउट Razorpay ने रिलीज़ किया (ref {ref})। बैंक क्रेडिट पार्टनर के सेटलमेंट शेड्यूल के अनुसार होगा।', hinglish: '💸 {id} ke liye {amount} ka payout Razorpay ne release kiya (ref {ref}). Bank credit partner ke settlement schedule ke hisaab se hoga.' },
  rated: { en: 'Thanks for rating {id} {score}/5.', te: '{id} కు {score}/5 రేటింగ్ ఇచ్చినందుకు ధన్యవాదాలు.', hi: '{id} को {score}/5 रेटिंग देने के लिए धन्यवाद।', hinglish: '{id} ko {score}/5 rating dene ke liye thanks.' },
  // ---- cancellations & refunds ----
  cancelled_free: { en: '{id} cancelled. You were not charged.', te: '{id} రద్దు చేయబడింది. మీ నుండి డబ్బు తీసుకోలేదు.', hi: '{id} रद्द हुआ। आपसे पैसा नहीं लिया गया।', hinglish: '{id} cancel ho gaya. Aapse paisa nahi liya gaya.' },
  cancelled_refund: { en: '{id} cancelled. A full refund of {amount} has been requested with Razorpay; banks usually credit it in 5–7 working days. We will message you when it is processed.', te: '{id} రద్దు చేయబడింది. {amount} పూర్తి రీఫండ్ Razorpay కు అభ్యర్థించబడింది; బ్యాంకులు సాధారణంగా 5–7 పని దినాల్లో జమ చేస్తాయి.', hi: '{id} रद्द हुआ। {amount} का पूरा रिफ़ंड Razorpay से माँगा गया है; बैंक आम तौर पर 5–7 कार्यदिवस में जमा करते हैं।', hinglish: '{id} cancel hua. {amount} ka full refund Razorpay se request kiya gaya; bank usually 5–7 working days mein credit karte hain.' },
  cancel_needs_review: { en: '{id} starts within {hours} hours, so cancellation needs our support team (ticket #{ticket}). You will hear back here.', te: '{id} {hours} గంటల్లో ప్రారంభమవుతుంది, కాబట్టి రద్దుకు సపోర్ట్ టీమ్ అవసరం (టికెట్ #{ticket}).', hi: '{id} {hours} घंटे के अंदर शुरू होना है, इसलिए रद्द करने के लिए सपोर्ट टीम देखेगी (टिकट #{ticket})।', hinglish: '{id} {hours} ghante ke andar shuru hona hai, isliye cancel ke liye support team dekhegi (ticket #{ticket}).' },
  worker_cancelled_customer: { en: 'Sorry — your tasker cancelled {id}. A full refund of {amount} has been requested, and your job is open again for new offers. Send STATUS {id}.', te: 'క్షమించండి — టాస్కర్ {id} రద్దు చేశారు. {amount} పూర్తి రీఫండ్ అభ్యర్థించబడింది, మీ పని కొత్త ఆఫర్ల కోసం మళ్లీ ఓపెన్. STATUS {id} పంపండి.', hi: 'माफ़ कीजिए — टास्कर ने {id} रद्द कर दिया। {amount} का पूरा रिफ़ंड माँगा गया है और आपका काम नए ऑफ़र के लिए फिर खुला है। STATUS {id} भेजें।', hinglish: 'Sorry — tasker ne {id} cancel kar diya. {amount} ka full refund request hua hai aur aapka kaam naye offers ke liye phir open hai. STATUS {id} bhejiye.' },
  worker_withdrew_unpaid: { en: 'The tasker withdrew from {id} before payment. You were not charged. Choose another offer: STATUS {id}', te: 'చెల్లింపుకు ముందే టాస్కర్ {id} నుండి తప్పుకున్నారు. మీ నుండి డబ్బు తీసుకోలేదు. మరో ఆఫర్ కోసం: STATUS {id}', hi: 'टास्कर ने पेमेंट से पहले {id} छोड़ दिया। आपसे पैसा नहीं लिया गया। दूसरा ऑफ़र चुनें: STATUS {id}', hinglish: 'Tasker ne payment se pehle {id} chhod diya. Aapse paisa nahi liya gaya. Dusra offer chuniye: STATUS {id}' },
  worker_cancelled_worker: { en: 'You cancelled {id}. Repeated cancellations may lead to suspension.', te: 'మీరు {id} రద్దు చేశారు. పదే పదే రద్దు చేస్తే సస్పెన్షన్ కావచ్చు.', hi: 'आपने {id} रद्द किया। बार-बार रद्द करने पर सस्पेंशन हो सकता है।', hinglish: 'Aapne {id} cancel kiya. Baar-baar cancel karne par suspension ho sakta hai.' },
  refund_after_review: { en: 'After review of {id}, a refund of {amount} has been requested with Razorpay. Banks usually credit refunds in 5–7 working days.', te: '{id} సమీక్ష తర్వాత {amount} రీఫండ్ Razorpay కు అభ్యర్థించబడింది. బ్యాంకులు సాధారణంగా 5–7 పని దినాల్లో జమ చేస్తాయి.', hi: '{id} की समीक्षा के बाद {amount} का रिफ़ंड Razorpay से माँगा गया है। बैंक आम तौर पर 5–7 कार्यदिवस में जमा करते हैं।', hinglish: '{id} ke review ke baad {amount} ka refund Razorpay se request kiya gaya. Bank usually 5–7 working days mein credit karte hain.' },
  refund_processed: { en: '💰 Refund of {amount} for {id} has been processed by Razorpay (ref {ref}).', te: '💰 {id} కోసం {amount} రీఫండ్ Razorpay ద్వారా ప్రాసెస్ అయింది (ref {ref}).', hi: '💰 {id} के लिए {amount} का रिफ़ंड Razorpay ने प्रोसेस किया (ref {ref})।', hinglish: '💰 {id} ke liye {amount} ka refund Razorpay ne process kiya (ref {ref}).' },
  refund_failed: { en: 'There was a problem processing the refund for {id}. Our support team is handling it (no action needed from you).', te: '{id} రీఫండ్‌లో సమస్య వచ్చింది. సపోర్ట్ టీమ్ పరిష్కరిస్తోంది.', hi: '{id} के रिफ़ंड में समस्या आई। सपोर्ट टीम देख रही है।', hinglish: '{id} ke refund mein problem aayi. Support team dekh rahi hai.' },
  // ---- worker ----
  join_name: { en: 'Tasker application 🧰\nWhat is your full name (as on your government ID)? We verify every tasker in person — do NOT send ID numbers or photos here.', te: 'టాస్కర్ దరఖాస్తు 🧰\nమీ పూర్తి పేరు (ప్రభుత్వ ID పై ఉన్నట్లు)? ప్రతి టాస్కర్‌ను వ్యక్తిగతంగా ధృవీకరిస్తాం — ఇక్కడ ID నంబర్లు, ఫోటోలు పంపవద్దు.', hi: 'टास्कर आवेदन 🧰\nआपका पूरा नाम (सरकारी ID के अनुसार)? हम हर टास्कर को व्यक्तिगत रूप से वेरिफ़ाई करते हैं — यहाँ ID नंबर या फ़ोटो न भेजें।', hinglish: 'Tasker application 🧰\nAapka poora naam (government ID ke hisaab se)? Hum har tasker ko in-person verify karte hain — yahan ID number ya photo mat bhejiye.' },
  bad_name: { en: 'Please send your full name (2–80 letters).', te: 'దయచేసి మీ పూర్తి పేరు పంపండి (2–80 అక్షరాలు).', hi: 'कृपया पूरा नाम भेजें (2–80 अक्षर)।', hinglish: 'Poora naam bhejiye (2–80 letters).' },
  join_area: { en: 'Which area do you live in / start from? Share a 📍 location pin or type the area name.', te: 'మీరు ఏ ప్రాంతంలో ఉంటారు? 📍 లొకేషన్ పంపండి లేదా ప్రాంతం పేరు టైప్ చేయండి.', hi: 'आप किस एरिया में रहते हैं? 📍 लोकेशन भेजें या एरिया का नाम लिखें।', hinglish: 'Aap kis area mein rehte hain? 📍 Location bhejiye ya area ka naam likhiye.' },
  join_skills: { en: 'Which jobs can you do? Reply with numbers or names, comma separated:\n{list}', te: 'మీరు ఏ పనులు చేయగలరు? సంఖ్యలు లేదా పేర్లు కామాతో పంపండి:\n{list}', hi: 'आप कौन से काम कर सकते हैं? नंबर या नाम कॉमा से भेजें:\n{list}', hinglish: 'Aap kaun se kaam kar sakte hain? Numbers ya names comma se bhejiye:\n{list}' },
  bad_skills: { en: 'Please choose at least one skill from the list.', te: 'జాబితా నుండి కనీసం ఒక నైపుణ్యం ఎంచుకోండి.', hi: 'सूची से कम से कम एक काम चुनें।', hinglish: 'List se kam se kam ek skill chuniye.' },
  join_done: { en: 'Application received ✅ Status: PENDING.\nOur team will call you to schedule identity, police-verification and skills checks, and to set up your payout account with our payment partner Razorpay. You will be notified here when approved.', te: 'దరఖాస్తు అందింది ✅ స్థితి: PENDING.\nగుర్తింపు, పోలీస్ వెరిఫికేషన్, నైపుణ్య పరీక్షలు మరియు Razorpay పేఅవుట్ ఖాతా కోసం మా టీమ్ కాల్ చేస్తుంది. ఆమోదం అయిన తర్వాత ఇక్కడ తెలియజేస్తాం.', hi: 'आवेदन मिल गया ✅ स्थिति: PENDING.\nपहचान, पुलिस वेरिफ़िकेशन, स्किल जाँच और Razorpay पेआउट खाते के लिए हमारी टीम आपको कॉल करेगी। मंज़ूरी मिलने पर यहीं बताया जाएगा।', hinglish: 'Application mil gayi ✅ Status: PENDING.\nIdentity, police verification, skills check aur Razorpay payout account ke liye team call karegi. Approve hone par yahin bataya jayega.' },
  worker_approved: { en: '🎉 You are a verified HYD Tasks tasker! Send AVAILABLE to start receiving job alerts, TASKS to see open jobs.', te: '🎉 మీరు ధృవీకరించబడిన HYD Tasks టాస్కర్! పని అలర్ట్‌ల కోసం AVAILABLE, ఓపెన్ పనుల కోసం TASKS పంపండి.', hi: '🎉 आप वेरिफ़ाइड HYD Tasks टास्कर हैं! जॉब अलर्ट के लिए AVAILABLE, खुले काम के लिए TASKS भेजें।', hinglish: '🎉 Aap verified HYD Tasks tasker hain! Job alerts ke liye AVAILABLE, open kaam ke liye TASKS bhejiye.' },
  worker_rejected: { en: 'Sorry, your tasker application was not approved this time. Send HELP if you have questions.', te: 'క్షమించండి, ఈసారి మీ దరఖాస్తు ఆమోదించబడలేదు. ప్రశ్నలు ఉంటే HELP పంపండి.', hi: 'माफ़ कीजिए, इस बार आपका आवेदन मंज़ूर नहीं हुआ। सवाल हों तो HELP भेजें।', hinglish: 'Sorry, is baar aapki application approve nahi hui. Sawal ho to HELP bhejiye.' },
  worker_suspended: { en: 'Your tasker account is suspended pending review. Send HELP to contact support.', te: 'సమీక్ష పూర్తయ్యే వరకు మీ ఖాతా నిలిపివేయబడింది. HELP పంపండి.', hi: 'समीक्षा तक आपका खाता निलंबित है। HELP भेजें।', hinglish: 'Review tak aapka account suspend hai. HELP bhejiye.' },
  need_verified: { en: 'Only verified taskers can do this. Send JOIN to apply.', te: 'ధృవీకరించిన టాస్కర్లు మాత్రమే ఇది చేయగలరు. JOIN పంపండి.', hi: 'यह सिर्फ़ वेरिफ़ाइड टास्कर कर सकते हैं। JOIN भेजें।', hinglish: 'Yeh sirf verified taskers kar sakte hain. JOIN bhejiye.' },
  application_pending: { en: 'Your application is still being verified. We will message you here.', te: 'మీ దరఖాస్తు ఇంకా ధృవీకరణలో ఉంది.', hi: 'आपका आवेदन अभी वेरिफ़िकेशन में है।', hinglish: 'Aapki application abhi verification mein hai.' },
  available_on: { en: '🟢 You are AVAILABLE. We will alert you about matching jobs nearby. Send TASKS anytime.', te: '🟢 మీరు AVAILABLE. సమీపంలోని పనుల గురించి తెలియజేస్తాం. ఎప్పుడైనా TASKS పంపండి.', hi: '🟢 आप AVAILABLE हैं। पास के काम की सूचना देंगे। कभी भी TASKS भेजें।', hinglish: '🟢 Aap AVAILABLE hain. Paas ke kaam ka alert denge. Kabhi bhi TASKS bhejiye.' },
  available_off: { en: '⚪ You are UNAVAILABLE. No new job alerts.', te: '⚪ మీరు UNAVAILABLE. కొత్త అలర్ట్‌లు రావు.', hi: '⚪ आप UNAVAILABLE हैं। नए अलर्ट नहीं आएँगे।', hinglish: '⚪ Aap UNAVAILABLE hain. Naye alerts nahi aayenge.' },
  job_alert: {
    en: '🆕 {id} · {category} · {area} ({distance} km)\n{description}\n🕒 {when} · Budget {budget}\nBid with: OFFER {id} amount optional note\ne.g. OFFER {id} 750 Can bring 2 helpers',
    te: '🆕 {id} · {category} · {area} ({distance} కి.మీ)\n{description}\n🕒 {when} · బడ్జెట్ {budget}\nబిడ్: OFFER {id} మొత్తం నోట్\nఉదా: OFFER {id} 750 ఇద్దరు సహాయకులతో వస్తాను',
    hi: '🆕 {id} · {category} · {area} ({distance} km)\n{description}\n🕒 {when} · बजट {budget}\nबोली: OFFER {id} राशि नोट\nजैसे: OFFER {id} 750 2 हेल्पर ला सकता हूँ',
    hinglish: '🆕 {id} · {category} · {area} ({distance} km)\n{description}\n🕒 {when} · Budget {budget}\nBid: OFFER {id} amount note\nJaise: OFFER {id} 750 2 helpers la sakta hoon',
  },
  no_open_tasks: { en: 'No matching open jobs near you right now.', te: 'ఇప్పుడు మీకు సమీపంలో సరిపోయే పనులు లేవు.', hi: 'अभी आपके पास कोई मिलता-जुलता काम नहीं है।', hinglish: 'Abhi aapke paas koi matching kaam nahi hai.' },
  open_tasks: { en: 'Open jobs for you:\n{list}\nBid: OFFER HYD0001 750', te: 'మీకోసం ఓపెన్ పనులు:\n{list}\nబిడ్: OFFER HYD0001 750', hi: 'आपके लिए खुले काम:\n{list}\nबोली: OFFER HYD0001 750', hinglish: 'Aapke liye open kaam:\n{list}\nBid: OFFER HYD0001 750' },
  offer_usage: { en: 'Use: OFFER HYD0001 750 optional note', te: 'వాడకం: OFFER HYD0001 750 నోట్', hi: 'ऐसे लिखें: OFFER HYD0001 750 नोट', hinglish: 'Aise likhiye: OFFER HYD0001 750 note' },
  offer_sent: { en: 'Offer of {amount} sent for {id}. You can update it by sending a new OFFER, or WITHDRAW {id}.', te: '{id} కోసం {amount} ఆఫర్ పంపబడింది. కొత్త OFFER తో మార్చవచ్చు లేదా WITHDRAW {id}.', hi: '{id} के लिए {amount} का ऑफ़र भेजा गया। नया OFFER भेजकर बदल सकते हैं, या WITHDRAW {id}।', hinglish: '{id} ke liye {amount} ka offer bheja. Naya OFFER bhejkar badal sakte hain, ya WITHDRAW {id}.' },
  offer_withdrawn: { en: 'Your offer for {id} was withdrawn.', te: '{id} కోసం మీ ఆఫర్ ఉపసంహరించబడింది.', hi: '{id} के लिए आपका ऑफ़र वापस लिया गया।', hinglish: '{id} ke liye aapka offer withdraw ho gaya.' },
  task_unavailable: { en: 'This job is not open for your offer (closed, outside your area or skills).', te: 'ఈ పని మీ ఆఫర్‌కు అందుబాటులో లేదు.', hi: 'यह काम आपके ऑफ़र के लिए उपलब्ध नहीं है।', hinglish: 'Yeh kaam aapke offer ke liye available nahi hai.' },
  // ---- support ----
  help_menu: { en: 'Support ({hours}).\n• HELP your question — message our team\n• DISPUTE HYD0001 what went wrong — report a problem with a job\n• CANCELJOB HYD0001 — cancel a job\nFor emergencies call 112.', te: 'సపోర్ట్ ({hours}).\n• HELP మీ ప్రశ్న — టీమ్‌కు సందేశం\n• DISPUTE HYD0001 సమస్య — పనిలో సమస్య తెలపండి\n• CANCELJOB HYD0001 — పని రద్దు\nఅత్యవసరంలో 112 కు కాల్ చేయండి.', hi: 'सपोर्ट ({hours}).\n• HELP आपका सवाल — टीम को मैसेज\n• DISPUTE HYD0001 क्या गलत हुआ — काम में समस्या बताएँ\n• CANCELJOB HYD0001 — काम रद्द करें\nआपात स्थिति में 112 पर कॉल करें।', hinglish: 'Support ({hours}).\n• HELP aapka sawal — team ko message\n• DISPUTE HYD0001 kya galat hua — kaam mein problem batayiye\n• CANCELJOB HYD0001 — kaam cancel\nEmergency mein 112 call kariye.' },
  ticket_created: { en: 'Ticket #{ticket} created. Our team replies here during support hours ({hours}). Add details any time: HELP #{ticket} more details', te: 'టికెట్ #{ticket} సృష్టించబడింది. సపోర్ట్ సమయాల్లో ({hours}) ఇక్కడే జవాబిస్తాం. మరిన్ని వివరాలు: HELP #{ticket} వివరాలు', hi: 'टिकट #{ticket} बनाया गया। सपोर्ट समय ({hours}) में हम यहीं जवाब देंगे। और जानकारी: HELP #{ticket} विवरण', hinglish: 'Ticket #{ticket} ban gaya. Support hours ({hours}) mein yahin reply karenge. Aur details: HELP #{ticket} details' },
  dispute_created: { en: 'Dispute ticket #{ticket} opened for {id}. Any payment is ON HOLD until our team resolves it. Both sides will be contacted here.', te: '{id} కోసం వివాద టికెట్ #{ticket} తెరవబడింది. టీమ్ పరిష్కరించే వరకు చెల్లింపు నిలిపి ఉంచబడింది.', hi: '{id} के लिए विवाद टिकट #{ticket} खोला गया। टीम के समाधान तक पेमेंट होल्ड पर है।', hinglish: '{id} ke liye dispute ticket #{ticket} khula. Team ke resolve karne tak payment hold par hai.' },
  dispute_other_party: { en: 'A problem was reported on {id} (ticket #{ticket}). Payment is on hold while our team reviews. Please share your side: HELP #{ticket} your explanation', te: '{id} పై సమస్య నివేదించబడింది (టికెట్ #{ticket}). సమీక్ష సమయంలో చెల్లింపు నిలిపివేయబడింది. మీ వివరణ: HELP #{ticket} వివరణ', hi: '{id} पर समस्या बताई गई (टिकट #{ticket})। समीक्षा तक पेमेंट होल्ड है। अपनी बात बताएँ: HELP #{ticket} विवरण', hinglish: '{id} par problem report hui (ticket #{ticket}). Review tak payment hold hai. Apni baat batayiye: HELP #{ticket} explanation' },
  dispute_usage: { en: 'Use: DISPUTE HYD0001 describe the problem (5–500 characters).', te: 'వాడకం: DISPUTE HYD0001 సమస్య వివరణ (5–500 అక్షరాలు).', hi: 'ऐसे लिखें: DISPUTE HYD0001 समस्या (5–500 अक्षर)।', hinglish: 'Aise likhiye: DISPUTE HYD0001 problem (5–500 characters).' },
  support_reply: { en: '🧑‍💼 Support (ticket #{ticket}): {body}', te: '🧑‍💼 సపోర్ట్ (టికెట్ #{ticket}): {body}', hi: '🧑‍💼 सपोर्ट (टिकट #{ticket}): {body}', hinglish: '🧑‍💼 Support (ticket #{ticket}): {body}' },
  ticket_resolved: { en: 'Ticket #{ticket} resolved: {outcome}', te: 'టికెట్ #{ticket} పరిష్కరించబడింది: {outcome}', hi: 'टिकट #{ticket} हल हुआ: {outcome}', hinglish: 'Ticket #{ticket} resolve hua: {outcome}' },
  // ---- data rights ----
  mydata: { en: 'Your data with HYD Tasks: role {role}, language {lang}, terms {terms}, {tasks} jobs posted, {offers} offers made, {tickets} support tickets. Send DELETE MY DATA to erase your personal data (payment and tax records are retained as required by law).', te: 'HYD Tasks వద్ద మీ డేటా: పాత్ర {role}, భాష {lang}, నిబంధనలు {terms}, {tasks} పనులు, {offers} ఆఫర్లు, {tickets} టికెట్లు. వ్యక్తిగత డేటా తొలగించడానికి DELETE MY DATA పంపండి (చట్టం ప్రకారం చెల్లింపు, పన్ను రికార్డులు ఉంచబడతాయి).', hi: 'HYD Tasks के पास आपका डेटा: भूमिका {role}, भाषा {lang}, शर्तें {terms}, {tasks} काम, {offers} ऑफ़र, {tickets} टिकट। निजी डेटा मिटाने के लिए DELETE MY DATA भेजें (कानून के अनुसार पेमेंट और टैक्स रिकॉर्ड रखे जाते हैं)।', hinglish: 'HYD Tasks ke paas aapka data: role {role}, language {lang}, terms {terms}, {tasks} kaam, {offers} offers, {tickets} tickets. Personal data delete karne ke liye DELETE MY DATA bhejiye (law ke hisaab se payment aur tax records rakhe jaate hain).' },
  erase_blocked: { en: 'You have active jobs. Please complete or cancel them before deleting your data.', te: 'మీకు యాక్టివ్ పనులు ఉన్నాయి. డేటా తొలగించే ముందు వాటిని పూర్తి చేయండి లేదా రద్దు చేయండి.', hi: 'आपके सक्रिय काम हैं। डेटा मिटाने से पहले उन्हें पूरा या रद्द करें।', hinglish: 'Aapke active kaam hain. Data delete karne se pehle unhe complete ya cancel kariye.' },
  erased: { en: 'Your personal data has been erased and you are opted out. Payment and tax records are kept only as required by law.', te: 'మీ వ్యక్తిగత డేటా తొలగించబడింది. చట్టం ప్రకారం అవసరమైన చెల్లింపు రికార్డులు మాత్రమే ఉంచబడతాయి.', hi: 'आपका निजी डेटा मिटा दिया गया है। केवल कानूनन ज़रूरी पेमेंट रिकॉर्ड रखे जाते हैं।', hinglish: 'Aapka personal data delete ho gaya. Sirf law ke hisaab se zaroori payment records rakhe jaate hain.' },
};

export const CATEGORY_NAMES = {
  moving: { en: 'Moving / lifting', te: 'సామాను మార్పు', hi: 'सामान शिफ़्टिंग', hinglish: 'Shifting / lifting' },
  cleaning: { en: 'Cleaning', te: 'శుభ్రపరచడం', hi: 'सफ़ाई', hinglish: 'Safai' },
  assembly: { en: 'Furniture assembly', te: 'ఫర్నిచర్ అమర్చడం', hi: 'फ़र्नीचर असेंबली', hinglish: 'Furniture assembly' },
  packing: { en: 'Packing', te: 'ప్యాకింగ్', hi: 'पैकिंग', hinglish: 'Packing' },
  handyman: { en: 'Minor repairs', te: 'చిన్న మరమ్మతులు', hi: 'छोटी मरम्मत', hinglish: 'Chhoti repair' },
  gardening: { en: 'Gardening', te: 'తోటపని', hi: 'बागवानी', hinglish: 'Gardening' },
  event: { en: 'Event help', te: 'ఈవెంట్ సహాయం', hi: 'इवेंट मदद', hinglish: 'Event help' },
  errands: { en: 'Errands / pickup', te: 'పనులు / పికప్', hi: 'काम-काज / पिकअप', hinglish: 'Errands / pickup' },
  office: { en: 'Office / shop help', te: 'ఆఫీస్ / షాప్ సహాయం', hi: 'ऑफ़िस / दुकान मदद', hinglish: 'Office / shop help' },
  general: { en: 'Other', te: 'ఇతర', hi: 'अन्य', hinglish: 'Other' },
};

const STATUS_NAMES = {
  review_pending: { en: 'under review', te: 'సమీక్షలో', hi: 'समीक्षा में', hinglish: 'review mein' },
  open: { en: 'open for offers', te: 'ఆఫర్లకు ఓపెన్', hi: 'ऑफ़र के लिए खुला', hinglish: 'offers ke liye open' },
  payment_pending: { en: 'awaiting payment', te: 'చెల్లింపు కోసం', hi: 'पेमेंट बाकी', hinglish: 'payment baaki' },
  booked: { en: 'booked', te: 'బుక్ అయింది', hi: 'बुक', hinglish: 'booked' },
  awaiting_confirmation: { en: 'awaiting your confirmation', te: 'నిర్ధారణ కోసం', hi: 'पुष्टि बाकी', hinglish: 'confirmation baaki' },
  completed: { en: 'completed', te: 'పూర్తయింది', hi: 'पूरा', hinglish: 'complete' },
  disputed: { en: 'under dispute review', te: 'వివాద సమీక్షలో', hi: 'विवाद समीक्षा में', hinglish: 'dispute review mein' },
  cancelled: { en: 'cancelled', te: 'రద్దు', hi: 'रद्द', hinglish: 'cancelled' },
  expired: { en: 'expired', te: 'గడువు ముగిసింది', hi: 'समाप्त', hinglish: 'expired' },
  rejected: { en: 'not approved', te: 'ఆమోదం లేదు', hi: 'मंज़ूर नहीं', hinglish: 'approve nahi' },
  refunded: { en: 'refunded', te: 'రీఫండ్ అయింది', hi: 'रिफ़ंड हुआ', hinglish: 'refunded' },
};

export function t(lang, key, params = {}) {
  const entry = M[key];
  if (!entry) throw new Error(`Missing i18n key ${key}`);
  const template = entry[lang] || entry.en;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined || params[k] === null ? '' : String(params[k])));
}
export const categoryName = (lang, c) => (CATEGORY_NAMES[c]?.[lang] || CATEGORY_NAMES[c]?.en || c);
export const statusName = (lang, s) => (STATUS_NAMES[s]?.[lang] || STATUS_NAMES[s]?.en || s);
export const hasKey = key => Boolean(M[key]);
export const allKeys = () => Object.keys(M);
export const catalog = () => M;

// Script-based detection for first contact; the user can always change with LANG.
export function detectLang(text) {
  const s = String(text || '');
  if (/[ఀ-౿]/.test(s)) return 'te';
  if (/[ऀ-ॿ]/.test(s)) return 'hi';
  if (/\b(namaste|kya|hai|chahiye|karna|karni|mujhe|kaam|ghar|bhai|kal|aaj|hoon|nahi|madad)\b/i.test(s)) return 'hinglish';
  if (/\b(namaskaram|kavali|cheyali|enti|pani|ela|unnaru|cheyandi)\b/i.test(s)) return 'te';
  return null;
}
