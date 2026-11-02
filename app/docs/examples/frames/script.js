// برنامج أسلوب «المبروز».
// في كتب «متن ثم شرح:» لا تحمل فقرات الشرح علامة تميزها، فلا يستطيع التنسيق وحده أن يضعها في خانة.
// هذا البرنامج يعلّمها قبل التنضيد (b.sh)، فتأخذ الصنف ‎.sh‎ ويبروزها style.css كما يبروز المتن.
W.on('doc', (doc) => {
  let sharh = false;
  for (const b of doc.blocks) {
    if (b.type === 'label') sharh = true;
    else if (b.type === 'heading' || b.type === 'ornament' || (b.type === 'para' && b.mt)) sharh = false;
    else if (b.type === 'para' && sharh) b.sh = true;
  }
});
