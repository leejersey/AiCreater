// Shared data only: browser components must not import the server-side plan parser.
export const teachingComponents={
 document:{states:['waiting','active','selected','rejected','stored'],canContain:false},
 wallet:{states:['empty','receiving','full'],canContain:true},
 classifier:{states:['idle','processing','emitting'],canContain:true},
 'loop-node':{states:['idle','active','complete','error'],canContain:true},
 container:{states:['empty','receiving','full'],canContain:true},
 indicator:{states:['idle','active','complete','error'],canContain:false},
} as const;
