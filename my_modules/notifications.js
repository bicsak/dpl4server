exports.notificationDefaults = {
    'scheduler': {
        commentNew: true, // neuer Kommentar
        dplChanged: true, // Änderungen im DPL
        dplFinal: true, // DPL veröfentlicht von DE oder Büro (genehmigt)
        surveyComplete: true, // Umfrage fertig
        surveyFailed: true, // Umfrage hat Ablehnung bekommen
        dplRejected: true // DPL zurückgeworfen
    },
    'board': {},
    'office': {
        dplChanged: true,
        dplFinal: true,
        approvalNew: true // Genehmigung angefragt
    },
    'musician': {
        commentNew: true,
        dplChanged: true,
        dplFinal: true,
        surveyNew: true // neue Umfrage
    }
};