exports.notificationDefaults = {
    'scheduler': {
        commentNew: true, // neuer Kommentar
        wplChanged: true, // new dienst added for a public dpl by manager or dienst instrumentation has been changed (by manager, for public dpl)
        dplChanged: true, // Änderungen im DPL (by scheduler or by manager upon deleting dienst)
        dplFinal: true, // DPL veröfentlicht von DE oder Büro (genehmigt)
        dplRejected: true, // DPL zurückgeworfen
        surveyComplete: true, // Umfrage fertig
        surveyFailed: true // Umfrage hat Ablehnung bekommen        
    },
    'board': {},
    'office': {
        dplChanged: true,
        dplFinal: true,
        dplRejected: true, // DPL zurückgewiesen von einer anderen Mitarbeiterin des OB
        approvalNew: true // Genehmigung angefragt
    },
    'musician': {
        commentNew: true,
        dplChanged: true,
        dplFinal: true,
        surveyNew: true // neue Umfrage
    }
};