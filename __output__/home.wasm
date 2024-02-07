(module 
	(func $+ (param $+::a i32) (param $+::b i32) (result i32) args.get $+::a args.get $+::b i32.add) 
	(func $- (param $-::a i32) (param $-::b i32) (result i32) args.get $-::a args.get $-::b i32.sub) 
	(func $eq (param $eq::a i32) (param $eq::b i32) (result i32) args.get $eq::a args.get $eq::b i32.sub i32.const 0 i32.eq) 
	(func $generic (param $generic::s i32) (result i32) 
		(if args.get $generic::s i32.const 2 i32.eq 
			(then args.get $generic::s call $generic) 
		(else 
		(if i32.const 0xFFFFFFFF 
			(then args.get $generic::s call $generic) 
		(else))))) 
	(func $BVV (param $BVV::a i32) (param $BVV::b i32) (result i32) call $BVV::bf) 
	(func $TST (param $TST::l i32) (param $TST::ab i32) (result i32) args.get $TST::l call $TST::b i32.add) 
	(func $BVV::bf (result i32) args.get $BVV::b args.get $BVV::a call $BVV) 
	(func $TST::b (result i32) args.get $TST::ab args.get $TST::l call $generic i32.add) 
(export $+ $- $eq $generic $BVV $TST)) 