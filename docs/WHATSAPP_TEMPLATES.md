# WhatsApp message templates to submit to Meta

Templates are needed only for messages sent **more than 24 hours after the user's last message**. Inside the 24-hour window the service sends the full interactive message instead. Submit each template in **English (en), Telugu (te) and Hindi (hi)**; Hinglish users receive the English template. Meta assigns the final category. The ones below are written as **Utility**: transactional updates the user asked for, with no promotion.

After approval, set the names in `WA_TEMPLATES`, for example:

```
WA_TEMPLATES={"job_alert":"hyd_job_alert_v1","offer_received":"hyd_offer_received_v1","payment_request":"hyd_payment_request_v1","booking_confirmed":"hyd_booking_confirmed_v1","completion_request":"hyd_completion_request_v1","generic_update":"hyd_job_update_v1"}
```

The parameter order must match exactly; it is fixed in code.

## job_alert: new matching job for an available tasker (5 params)
- en: `New job {{1}} matching your skills: {{2}} in {{3}}, budget {{4}}, on {{5}}. Reply TASKS to see details and send your offer.`
- te: `మీ నైపుణ్యాలకు సరిపోయే కొత్త పని {{1}}: {{3}} లో {{2}}, బడ్జెట్ {{4}}, {{5}} న. వివరాలు చూసి ఆఫర్ పంపడానికి TASKS అని జవాబు ఇవ్వండి.`
- hi: `आपकी स्किल से मिलता नया काम {{1}}: {{3}} में {{2}}, बजट {{4}}, {{5}} को। विवरण देखने और ऑफ़र भेजने के लिए TASKS लिखकर जवाब दें।`
- Sample: `HYD0001`, `Moving / lifting`, `Gachibowli`, `₹800`, `Wed, 25 Nov, 2026, 10:00 am`

## offer_received (2 params)
- en: `You have a new offer of {{2}} for your job {{1}}. Reply STATUS {{1}} to compare offers and book.`
- te: `మీ పని {{1}} కు {{2}} కొత్త ఆఫర్ వచ్చింది. ఆఫర్లు పోల్చి బుక్ చేయడానికి STATUS {{1}} అని జవాబు ఇవ్వండి.`
- hi: `आपके काम {{1}} के लिए {{2}} का नया ऑफ़र आया है। ऑफ़र देखने और बुक करने के लिए STATUS {{1}} लिखकर जवाब दें।`

## payment_request (2 params)
- en: `Your booking {{1}} is reserved. Total payable: {{2}}. Reply PAY {{1}} to receive your secure payment link.`
- te: `మీ బుకింగ్ {{1}} రిజర్వ్ అయింది. చెల్లించాల్సిన మొత్తం: {{2}}. సురక్షిత చెల్లింపు లింక్ కోసం PAY {{1}} అని జవాబు ఇవ్వండి.`
- hi: `आपकी बुकिंग {{1}} रिज़र्व है। कुल भुगतान: {{2}}। सुरक्षित पेमेंट लिंक पाने के लिए PAY {{1}} लिखकर जवाब दें।`

## booking_confirmed (2 params)
- en: `Booking {{1}} is confirmed for {{2}}. Reply STATUS {{1}} for details.`
- te: `బుకింగ్ {{1}} {{2}} కు నిర్ధారించబడింది. వివరాల కోసం STATUS {{1}} అని జవాబు ఇవ్వండి.`
- hi: `बुकिंग {{1}} {{2}} के लिए पक्की हो गई है। विवरण के लिए STATUS {{1}} लिखकर जवाब दें।`

## completion_request (1 param)
- en: `Your tasker marked job {{1}} as done. Reply CONFIRM {{1}} if everything is fine, or DISPUTE {{1}} followed by the problem.`
- te: `మీ టాస్కర్ పని {{1}} పూర్తయిందని తెలిపారు. అంతా సరిగా ఉంటే CONFIRM {{1}}, సమస్య ఉంటే DISPUTE {{1}} తర్వాత సమస్యను రాయండి.`
- hi: `आपके टास्कर ने काम {{1}} पूरा बताया है। सब ठीक हो तो CONFIRM {{1}}, समस्या हो तो DISPUTE {{1}} के बाद समस्या लिखें।`

## generic_update (2 params: reference, short status)
- en: `Update on your HYD Tasks request {{1}}: {{2}}. Reply MENU to see details.`
- te: `మీ HYD Tasks అభ్యర్థన {{1}} పై అప్‌డేట్: {{2}}. వివరాల కోసం MENU అని జవాబు ఇవ్వండి.`
- hi: `आपके HYD Tasks अनुरोध {{1}} पर अपडेट: {{2}}। विवरण के लिए MENU लिखकर जवाब दें।`
- Note: the status phrase `{{2}}` is currently sent in English (for example "refund processed"). Meta may reject templates that are mostly variable text; if so, split this into specific templates (refund_processed, payout_released, support_reply…).

All template texts need native-speaker review before submission.
