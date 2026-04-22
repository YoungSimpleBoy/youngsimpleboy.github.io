(function (global) {
    "use strict";

    const groups = [
        {
            number: 1,
            hm: "P1",
            hall: "P 1",
            crystalSystem: "triclinic",
            symmetryOperations: [
                "x,y,z"
            ]
        },
        {
            number: 2,
            hm: "P-1",
            hall: "-P 1",
            crystalSystem: "triclinic",
            symmetryOperations: [
                "x,y,z",
                "-x,-y,-z"
            ]
        },
        {
            number: 14,
            hm: "P21/c",
            hall: "-P 2ybc",
            crystalSystem: "monoclinic",
            uniqueAxis: "b",
            symmetryOperations: [
                "x,y,z",
                "-x,y+1/2,-z+1/2",
                "-x,-y,-z",
                "x,-y+1/2,z+1/2"
            ]
        }
    ];

    const byHm = {};
    const byNumber = {};
    for (const g of groups) {
        byHm[g.hm] = g;
        byNumber[String(g.number)] = g;
    }

    global.SpaceGroupDataMin = {
        version: "0.1.0",
        groups,
        byHm,
        byNumber
    };
})(window);
